"""Identidad de una corrida por lote.

`RequestIdMiddleware` genera un `request_id` por peticion y lo deja en
`request.state`. Un comando de cron corre sin `Request`, asi que sin esto sus
logs no se pueden correlacionar: quedaria una corrida de veinte documentos
como veinte lineas sueltas sin nada que las una.

Se usa el mismo nombre de campo (`request_id`) a proposito, para que buscar en
los logs del proveedor funcione igual venga de HTTP o de un cron.
"""

from uuid import uuid4


def run_id() -> str:
    """Identificador de una corrida completa, no de un documento."""
    return str(uuid4())
