# Cloud SO App v5 Premium

Dashboard premium de monitoramento de sistema operacional criado com **Node.js + Express.js + JavaScript puro**, preparado para execução local e deploy no Render.

A versão 5 mantém as telas da versão anterior e acrescenta uma camada premium completa de visualização, análise, diagnóstico, personalização e exportação. O projeto possui mais de 8 mil linhas distribuídas entre backend, HTML, CSS e JavaScript do frontend.

## Principais recursos

### Monitoramento do host Node.js

- Uso total de CPU e uso por núcleo lógico.
- Modelo, fabricante, clocks, caches, núcleos físicos e lógicos quando disponíveis.
- Memória RAM total, usada, livre, disponível, cache, buffers, swap e módulos físicos.
- Discos físicos, volumes, capacidade, uso e espaço livre.
- GPUs, VRAM, temperatura, clock e driver quando o sistema operacional disponibiliza esses dados.
- Sensores térmicos e bateria quando suportados.
- Interfaces de rede, IP, CIDR, máscara, MAC, tráfego acumulado e taxa de download/upload.
- Lista dos processos com maior uso de CPU e memória.
- Informações completas do sistema, boot, usuário, diretórios e arquitetura.
- Runtime Node.js, V8, libuv, OpenSSL, heap, RSS, CPU do processo, event loop e contadores HTTP.

### Interface premium

- Cockpit com gauges de CPU, RAM, disco, Event Loop e rede.
- Estatísticas de sessão: atual, média, mínimo e pico.
- Linha do tempo de eventos e central de notificações.
- Gráficos históricos com janelas de 1 min, 5 min, 15 min ou sessão completa.
- Heatmap de utilização dos núcleos de CPU.
- Donut de composição da memória.
- Barras de capacidade por volume.
- Gráfico de requests HTTP por segundo.
- Scatter plot CPU × memória dos principais processos.
- Painel de Navigation Timing do navegador.
- Diagnóstico automático com notas de estabilidade, capacidade, runtime, rede e nota geral.
- Recomendações automáticas baseadas nas métricas atuais.
- Informações avançadas de scheduler, DNS, V8, hosting e capabilities.
- Linux PSI — Pressure Stall Information — quando suportado pelo kernel.
- Data Explorer para navegar pelo JSON coletado pela aplicação.

### Modos e personalização

- Modo Padrão.
- Modo Compacto.
- Modo Performance.
- Modo Wallboard para segundo monitor/apresentação.
- Tema Dark.
- Tema Light.
- Tema Aurora.
- Alto contraste.
- Cor de destaque personalizada.
- Três densidades de interface.
- Ajuste de arredondamento dos cards.
- Efeito glass opcional.
- Animações opcionais.
- Grid dos gráficos opcional.
- Painéis podem ser fixados, recolhidos e abertos em modo foco.
- Preferências armazenadas no `localStorage`.

### Produtividade

- `Ctrl + K` abre a central de comandos.
- `/` também abre a busca quando nenhum campo está sendo editado.
- Exportação de snapshot JSON.
- Exportação do histórico da sessão em CSV.
- Cópia de resumo do sistema em texto.
- Impressão do dashboard com layout otimizado.
- Central de eventos da sessão.
- Limites de alerta configuráveis.

### Modos de conexão

A aplicação oferece dois modos no painel de configurações:

1. **Polling** — consulta `/api/system` em um intervalo configurável.
2. **Live stream (SSE)** — utiliza Server-Sent Events através de `/api/live`.

O polling é usado por padrão por ser simples e compatível com qualquer ambiente. O SSE pode ser ativado nas configurações premium.

## APIs

### `GET /api/system`

Snapshot completo das informações principais do host Node.js.

### `GET /api/diagnostics`

Informações avançadas usadas pela versão premium:

- DNS.
- V8 heap statistics.
- V8 heap spaces.
- Scheduler e load average.
- Event Loop Utilization.
- Capabilities do runtime.
- Ambiente de hospedagem detectado.
- Linux PSI e limites do kernel quando disponíveis.

### `GET /api/export`

Une o snapshot do sistema e o diagnóstico avançado em um único JSON.

### `GET /api/live`

Stream SSE que envia snapshots periódicos do sistema.

### `GET /api/health`

Health check simples para Render e outros provedores.

## Executar localmente

Requisitos:

- Node.js 18.20 ou superior.
- npm.

```bash
npm install
npm start
```

Abra:

```text
http://localhost:3000
```

Modo de desenvolvimento:

```bash
npm run dev
```

Validação de sintaxe:

```bash
npm run check
```

## Deploy no Render

O projeto já inclui `render.yaml`.

Configuração manual equivalente:

```text
Service Type: Web Service
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

O backend utiliza:

```javascript
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
```

Portanto, não é necessário criar uma variável `PORT` manualmente no Render.

## Local x Render

Quando o projeto é executado localmente, CPU, RAM, discos, processos e demais métricas do backend representam o seu computador.

Quando o projeto está no Render, essas métricas representam o **servidor/container onde o Node.js está executando**.

A seção **Seu dispositivo** utiliza APIs do navegador para exibir informações disponíveis do computador que está acessando o site, como tela, GPU WebGL, memória aproximada, núcleos lógicos expostos pelo navegador, conexão e bateria quando suportada.

## Estrutura

```text
cloud-so-app/
├── app.js
├── package.json
├── render.yaml
├── README.md
└── public/
    ├── index.html
    ├── styles.css
    ├── premium.css
    ├── app.js
    └── premium.js
```

## Observações de compatibilidade

Nem toda informação de hardware é disponibilizada por todos os sistemas operacionais ou containers. A aplicação foi escrita com fallbacks para que métricas indisponíveis apareçam como `N/D` sem quebrar o restante do dashboard.

Algumas APIs do navegador também podem ser limitadas por privacidade, implementação do browser ou contexto de segurança. Isso é esperado.

## Versão

**5.0.0 — Premium Monitoring Dashboard**
