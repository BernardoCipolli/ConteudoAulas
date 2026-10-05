# Cloud SO App

Dashboard local completo para visualizar informações do sistema operacional e do processo Node.js usando **Express.js** e o módulo nativo **os**.

## Recursos

- CPU em tempo real e uso por núcleo lógico
- Modelo, quantidade de núcleos e frequência média da CPU
- Memória RAM total, usada e livre
- Espaço total, usado e livre do disco principal
- Host, plataforma, arquitetura, release, usuário e uptime
- Interfaces de rede IPv4/IPv6, máscara e MAC
- Versões do Node.js, Express e V8
- PID, diretório da aplicação e uso de memória do processo Node
- Histórico visual de CPU e RAM
- Atualização automática configurável
- Tema claro/escuro
- Layout responsivo para desktop e celular
- Endpoints JSON `/api/system` e `/api/health`

## Como executar

```bash
npm install
npm start
```

Abra no navegador:

```text
http://localhost:3000
```

### Modo de desenvolvimento

```bash
npm run dev
```

## Endpoints

- `GET /` — dashboard
- `GET /api/system` — métricas completas em JSON
- `GET /api/health` — status da aplicação

## Observação de segurança

O dashboard exibe informações locais como nome do host, usuário, caminhos do sistema, IP e MAC. Ele foi criado para uso local/educacional. Se for publicado na internet, remova ou proteja esses dados com autenticação.
