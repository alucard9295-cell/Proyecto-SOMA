# DeepSeek Harness (dsh web) como herramienta de desarrollo, no como parte del
# producto. El contenedor es la caja de arena: el agente ejecuta comandos aqui,
# con el repo montado, y no ve el resto de la maquina.
FROM node:22-slim

# git y ripgrep: lo minimo que un agente de codigo espera tener a mano.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ripgrep ca-certificates socat \
 && rm -rf /var/lib/apt/lists/*

# Version fijada: es un release candidate y su configuracion cambia entre rc.
ARG DSH_VERSION=0.1.5-rc.3
RUN npm install -g @deepseek-ai/dsh@${DSH_VERSION} && npm cache clean --force

# Creados aqui para que los volumenes con nombre hereden el dueno node.
RUN mkdir -p /workspace/node_modules /home/node/.dsh \
 && chown -R node:node /workspace /home/node/.dsh

ENV DSH_HOME=/home/node/.dsh \
    DSH_TELEMETRY_DISABLED=1
USER node
WORKDIR /workspace

# dsh se niega a escuchar en 0.0.0.0 (seria ejecucion remota para toda la red),
# asi que escucha en el loopback del contenedor y socat reenvia desde 3081.
# compose publica 3081 solo en 127.0.0.1 del host: la exposicion queda igual
# que correr dsh nativo en Windows, y la UI sigue pidiendo el ?token= del log.
EXPOSE 3081
CMD ["sh", "-c", "socat TCP-LISTEN:3081,fork,reuseaddr TCP:127.0.0.1:3080 & exec dsh web --no-open --port 3080"]
