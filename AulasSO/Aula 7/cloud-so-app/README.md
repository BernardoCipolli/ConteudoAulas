# Cloud SO App 4.0

Dashboard avançado e dinâmico de monitoramento de sistema feito com **Node.js + Express.js**.

## Novidades da versão 4

- Gráficos ao vivo de CPU/RAM, rede e event loop.
- Histórico selecionável de 1, 5 ou 15 minutos.
- Sparklines nos cards principais.
- Índice de saúde do sistema calculado em tempo real.
- Alertas visuais para CPU, RAM, disco, event loop e temperatura da GPU.
- Picos observados durante a sessão.
- Top processos em barras.
- Tooltip nos gráficos ao passar o mouse.
- Modo foco para qualquer painel.
- Tela cheia.
- Sidebar recolhível.
- Pausar/retomar monitoramento sem perder o histórico.
- Quatro modos de visualização: Padrão, Compacto, Performance e Wallboard.
- Quatro temas: Dark, Light, Aurora e Alto Contraste.
- Preferências de tema, modo e sidebar salvas no navegador.
- Layout responsivo.

## Modos

**Padrão** — todos os dados e detalhes.

**Compacto** — reduz espaçamentos e aumenta a densidade das informações.

**Performance** — prioriza gráficos, hardware, rede, processos e runtime.

**Wallboard** — remove o menu e detalhes secundários para usar como painel de monitoramento em tela cheia.

## Executar localmente

```bash
npm install
npm start
```

Abra:

```text
http://localhost:3000
```

## Render

O projeto continua preparado para o Render.

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

O servidor usa `process.env.PORT` e escuta em `0.0.0.0`.

## Importante

Quando executado no **Render**, CPU, RAM, discos, processos e demais métricas do backend representam o servidor/container do Render. A seção **Seu dispositivo** mostra as informações que o navegador permite obter do computador que está acessando a página.

Quando executado **localmente**, as métricas do backend representam o próprio computador.

## API

- `GET /api/system` — snapshot completo do sistema.
- `GET /api/health` — estado básico do serviço.
