import asyncio
import json
import logging
import re
from typing import Any

from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_openai import ChatOpenAI

from .config import Settings
from .mcp import load_external_tools
from .simulation import RemodelInput, calculate_remodeling


logger = logging.getLogger(__name__)


@tool
def estimate_remodel(
    area_m2: float,
    units: int,
    tier: str = "standard",
    acquisition_cost: float = 0,
    monthly_rent_per_unit: float = 0,
) -> str:
    """Estimate renovation cost, annual ROI and payback for a property scenario."""
    result = calculate_remodeling(
        RemodelInput(
            area_m2=area_m2,
            units=units,
            tier=tier,
            acquisition_cost=acquisition_cost,
            monthly_rent_per_unit=monthly_rent_per_unit,
        )
    )
    return json.dumps(result, ensure_ascii=False)


def extract_scenario(text: str) -> tuple[float, int]:
    area_match = re.search(r"(\d+(?:[.,]\d+)?)\s*m(?:2|²)", text.lower())
    units_match = re.search(
        r"(\d+)\s*(?:apartamentos?|unidades?|viviendas?)", text.lower()
    )
    area = float(area_match.group(1).replace(",", ".")) if area_match else 120.0
    units = int(units_match.group(1)) if units_match else 2
    return area, units


def architecture_plan(text: str) -> dict[str, Any]:
    area, units = extract_scenario(text)
    estimate = calculate_remodeling(
        RemodelInput(
            area_m2=area,
            units=units,
            tier="standard",
            acquisition_cost=0,
            monthly_rent_per_unit=0,
        )
    )
    budget = estimate["construction"]["total"]
    return {
        "title": "Estudio preliminar de transformación",
        "summary": "Una primera hipótesis para ordenar alcance, presupuesto y validaciones antes de diseñar.",
        "inputs": {"area_m2": area, "units": units, "budget": budget},
        "phases": [
            {"name": "Lectura", "duration": "1 semana", "share": "diagnóstico", "deliverable": "Levantamiento, restricciones y programa."},
            {"name": "Anteproyecto", "duration": "2-3 semanas", "share": "escenarios", "deliverable": "Distribución y comparación de alternativas."},
            {"name": "Viabilidad", "duration": "1 semana", "share": "decisión", "deliverable": "Presupuesto preliminar y retorno bajo supuestos."},
        ],
        "next_steps": [
            "Confirmar ciudad, estado estructural y normativa aplicable.",
            "Validar rentas comparables y costos con proveedores locales.",
            "Convertir el escenario elegido en presupuesto por capítulos.",
        ],
        "risks": [
            "El costo por m² es una referencia, no una cotización.",
            "Permisos, estructura y redes pueden cambiar el alcance.",
            "El retorno depende de ocupación, renta y gastos reales.",
        ],
        "budget": {"note": f"Referencia de obra estándar: {budget:,.0f} COP, sin compra del inmueble."},
    }


class ArchitectureAgent:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.external_tools: list[Any] = []
        self.graph = self._build_graph()

    @property
    def llm_enabled(self) -> bool:
        return bool(self.settings.agent_api_key)

    async def initialize(self) -> None:
        try:
            self.external_tools = await load_external_tools(self.settings)
        except Exception as error:  # External MCP must not take down the API.
            logger.warning("Optional MCP tools unavailable: %s", error)
            self.external_tools = []
        self.graph = self._build_graph()

    def _build_graph(self):
        tools = [estimate_remodel, *self.external_tools]
        builder = StateGraph(MessagesState)
        if not self.llm_enabled:
            def fallback(state: MessagesState):
                user_text = _last_user_text(state["messages"])
                plan = architecture_plan(user_text)
                budget = plan["inputs"]["budget"]
                message = (
                    "Puedo ayudarte a estudiar el potencial del inmueble. "
                    f"Para {plan['inputs']['area_m2']:g} m² y {plan['inputs']['units']} unidades, "
                    f"la referencia de obra estándar es {budget:,.0f} COP. "
                    "Faltan ciudad, renta comparable, estructura y permisos para una decisión responsable."
                )
                return {"messages": [AIMessage(content=message)]}

            builder.add_node("fallback", fallback)
            builder.add_edge(START, "fallback")
            builder.add_edge("fallback", END)
            return builder.compile()

        model = ChatOpenAI(
            model=self.settings.agent_model,
            api_key=self.settings.agent_api_key,
            base_url=self.settings.agent_base_url,
            temperature=0,
        ).bind_tools(tools)

        def call_model(state: MessagesState):
            return {"messages": [model.invoke(state["messages"])]}

        builder.add_node("agent", call_model)
        builder.add_node("tools", ToolNode(tools))
        builder.add_edge(START, "agent")
        builder.add_conditional_edges("agent", tools_condition)
        builder.add_edge("tools", "agent")
        return builder.compile()

    async def stream(self, text: str):
        if not self.llm_enabled:
            result = await asyncio.to_thread(
                self.graph.invoke, {"messages": [{"role": "user", "content": text}]}
            )
            content = _message_text(result["messages"][-1])
            yield content
            return

        async for chunk in self.graph.astream(
            {"messages": [{"role": "user", "content": text}]},
            stream_mode="messages",
            version="v2",
        ):
            if chunk["type"] != "messages":
                continue
            message, metadata = chunk["data"]
            if metadata.get("langgraph_node") != "agent":
                continue
            content = _message_text(message)
            if content:
                yield content


def _last_user_text(messages: list[Any]) -> str:
    for message in reversed(messages):
        if getattr(message, "type", None) == "human":
            return _message_text(message)
        if isinstance(message, dict) and message.get("role") == "user":
            return str(message.get("content", ""))
    return ""


def _message_text(message: Any) -> str:
    content = getattr(message, "content", message)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        )
    return str(content or "")
