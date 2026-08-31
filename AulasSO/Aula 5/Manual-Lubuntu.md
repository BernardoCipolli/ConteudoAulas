md


🐧 Manual de Instalação e Virtualização do Lubuntu no Oracle VirtualBox
Atividade: Instalação, configuração e teste de uma máquina virtual
Linux
Sistema virtualizado: Lubuntu
Software de virtualização: Oracle VirtualBox
Aluno: Bernardo Cipolli
Data: 31/08/2026

📌 Sumário
Objetivo

O que é virtualização?

Ferramentas utilizadas

Mapa mental

Fluxo da atividade

Instalação do Oracle
VirtualBox

Download da imagem ISO do
Lubuntu

Criação da máquina virtual

Configuração da máquina
virtual

Instalação do Lubuntu

Primeira inicialização

Testes e exploração

Arquitetura da virtualização

Recursos da VM

Problemas e soluções

Conclusão

Checklist

🎯 Objetivo
O objetivo desta atividade foi aprender, na prática, o funcionamento da
virtualização de sistemas operacionais.

Para isso, foi instalado o Oracle VirtualBox no computador e criada
uma máquina virtual destinada à execução de uma distribuição Linux leve.

A distribuição escolhida foi o Lubuntu, por possuir uma interface
gráfica simples, boa usabilidade e baixo consumo de recursos quando
comparada a sistemas mais pesados.

Durante a atividade foram realizadas as seguintes etapas:

💻 Instalação do Oracle VirtualBox;

🐧 obtenção da imagem ISO do Lubuntu;

⚙️ criação e configuração de uma máquina virtual;

💿 instalação do Lubuntu;

🚀 inicialização do sistema virtualizado;

🌐 teste de acesso à Internet;

📁 exploração do sistema de arquivos;

🖥️ teste de aplicativos;

🔧 exploração das configurações;

📝 documentação de todo o procedimento.

🧠 O que é virtualização?
A virtualização permite executar um sistema operacional dentro de
outro sistema operacional por meio de uma máquina virtual.

No procedimento realizado nesta atividade, o computador possui o sistema
operacional principal, enquanto o VirtualBox funciona como o
software responsável por criar o ambiente virtual.

Dentro desse ambiente foi instalado o Lubuntu.

Estrutura simplificada
┌───────────────────────────────────────┐
│            💻 Computador             │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │       Sistema Operacional       │  │
│  │             Host                │  │
│  │                                 │  │
│  │  ┌───────────────────────────┐  │  │
│  │  │     Oracle VirtualBox     │  │  │
│  │  │                           │  │  │
│  │  │  ┌─────────────────────┐  │  │  │
│  │  │  │ 🐧 Lubuntu (Guest) │  │  │  │
│  │  │  └─────────────────────┘  │  │  │
│  │  └───────────────────────────┘  │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
Conceitos importantes
Conceito Descrição

🖥️ Host Computador/sistema principal que
executa o VirtualBox

📦 Máquina Virtual (VM) Computador simulado por software

🐧 Guest Sistema operacional executado
dentro da VM

💿 ISO Arquivo que contém a mídia de
instalação do sistema

⚙️ VirtualBox Hipervisor utilizado para criar e
executar a VM

🛠️ Ferramentas utilizadas
Ferramenta Utilização

🟦 Oracle VirtualBox Criação e execução da máquina virtual
🐧 Lubuntu Sistema operacional Linux instalado na VM
💿 Imagem ISO Mídia utilizada para instalar o Lubuntu
🌐 Navegador Download dos programas e teste de Internet
🖥️ Terminal Linux Testes e exploração do sistema

🧩 Mapa mental
mindmap
  root((🐧 Virtualização))
    Oracle VirtualBox
      Instalação
      Criação da VM
      Configurações
        RAM
        CPU
        Disco virtual
        Rede
    Lubuntu
      ISO
      Instalação
      Usuário
      Interface gráfica
    Testes
      Internet
      Terminal
      Arquivos
      Aplicativos
      Configurações
    Aprendizado
      Host
      Guest
      VM
      Recursos virtuais
ℹ️ Observação: plataformas compatíveis com Mermaid, como algumas
visualizações de Markdown, podem renderizar o mapa mental acima
automaticamente.

🔄 Fluxo da atividade
flowchart TD
    A[🚀 Início] --> B[📥 Baixar VirtualBox]
    B --> C[⚙️ Instalar VirtualBox]
    C --> D[🐧 Obter ISO do Lubuntu]
    D --> E[➕ Criar nova VM]
    E --> F[🧠 Definir RAM e CPU]
    F --> G[💾 Criar disco virtual]
    G --> H[💿 Selecionar ISO]
    H --> I[▶️ Inicializar VM]
    I --> J[🛠️ Instalar Lubuntu]
    J --> K[🔄 Reiniciar]
    K --> L[🧪 Testar sistema]
    L --> M[📝 Documentar]
    M --> N[📚 Salvar no repositório]
📥 1. Instalação do Oracle VirtualBox
O primeiro passo foi instalar o software responsável pela virtualização.

O Oracle VirtualBox permite criar computadores virtuais utilizando
recursos do computador físico, como memória RAM, processador,
armazenamento e conexão de rede.

Procedimento
Acessar o site oficial do Oracle VirtualBox;

localizar a seção de downloads;

selecionar a versão compatível com o sistema operacional;

baixar o instalador;

executar o arquivo;

seguir as etapas apresentadas pelo assistente;

manter os componentes necessários selecionados;

concluir a instalação;

abrir o VirtualBox.

📸 Evidência sugerida
Adicione uma captura do VirtualBox instalado:

![Tela inicial do Oracle VirtualBox](imagens/01-virtualbox.png)
💿 2. Download da imagem ISO do Lubuntu
Após instalar o VirtualBox, foi necessário obter o instalador do sistema
operacional que seria executado na máquina virtual.

Foi escolhido o Lubuntu, uma distribuição Linux baseada no Ubuntu
que utiliza um ambiente gráfico leve.

Motivos para utilizar o Lubuntu
🪶 baixo consumo de recursos;

🖥️ interface gráfica;

🐧 baseado em Linux/Ubuntu;

📚 adequado para aprendizado;

⚡ bom desempenho em máquinas virtuais;

🧰 possui ferramentas básicas para utilização do sistema.

O arquivo baixado possui formato .iso.

Esse arquivo funciona como uma mídia de instalação virtual.

📸 Evidência sugerida
![Imagem ISO do Lubuntu](imagens/02-lubuntu-iso.png)
🖥️ 3. Criação da máquina virtual
Com o VirtualBox instalado e a ISO disponível, foi criada uma nova
máquina virtual.

Passos
Abrir o Oracle VirtualBox;

clicar em Novo / New;

informar um nome para a máquina virtual, por exemplo:

Lubuntu
selecionar a imagem ISO do Lubuntu;

conferir o tipo de sistema operacional;

avançar para a configuração de hardware.

Estrutura
Oracle VirtualBox
        │
        └── 📦 Máquina Virtual
                │
                └── 🐧 Lubuntu
📸 Evidência sugerida
![Criação da máquina virtual](imagens/03-criacao-vm.png)
⚙️ 4. Configuração da máquina virtual
Uma máquina virtual utiliza parte dos recursos disponíveis no computador
físico.

Os principais recursos configurados são:

flowchart LR
    PC[💻 Computador físico]
    PC --> CPU[⚙️ Processador]
    PC --> RAM[🧠 Memória RAM]
    PC --> DISK[💾 Armazenamento]
    PC --> NET[🌐 Rede]

    CPU --> VM[📦 Máquina Virtual]
    RAM --> VM
    DISK --> VM
    NET --> VM

    VM --> LUB[🐧 Lubuntu]
🧠 Memória RAM
Foi reservada memória RAM para que o Lubuntu pudesse executar suas
aplicações.

É importante não disponibilizar toda a memória do computador para a VM,
pois o sistema principal também precisa continuar funcionando.

⚙️ Processadores
Também foram disponibilizados núcleos virtuais do processador.

Quanto mais recursos forem destinados à máquina virtual, maior poderá
ser seu desempenho, desde que o computador físico tenha recursos
suficientes.

💾 Disco rígido virtual
Foi criado um disco virtual para armazenar:

sistema operacional;

configurações;

programas;

arquivos do usuário;

atualizações.

O disco virtual fica armazenado no computador físico como um arquivo
utilizado pelo VirtualBox.

Exemplo de configuração
Recurso Exemplo

🧠 RAM 4 GB
⚙️ CPUs virtuais 2
💾 Disco virtual 25 GB ou mais
🖥️ Sistema Lubuntu 64 bits
🌐 Rede NAT

⚠️ Os valores acima são exemplos. A configuração pode variar de acordo
com os recursos disponíveis no computador.

📸 Evidência sugerida
![Configuração de hardware da VM](imagens/04-hardware-vm.png)
🐧 5. Instalação do Lubuntu
Depois de configurar a VM, ela foi inicializada utilizando a imagem ISO.

O VirtualBox simula a inicialização de um computador real.

💻 Computador
      ↓
📦 VirtualBox
      ↓
▶️ Inicialização da VM
      ↓
💿 ISO do Lubuntu
      ↓
🐧 Instalador
      ↓
💾 Disco virtual
      ↓
✅ Lubuntu instalado
Etapas realizadas
iniciar a máquina virtual;

aguardar o carregamento do Lubuntu;

selecionar a opção de instalação;

definir o idioma;

configurar teclado;

selecionar as opções de instalação;

selecionar o disco virtual;

criar usuário e senha;

confirmar a instalação;

aguardar a cópia dos arquivos;

reiniciar a VM.

⚠️ O disco apresentado dentro da máquina virtual é um disco
virtual. Dessa forma, a instalação realizada corretamente na VM não
formata o disco físico do computador host.

📸 Evidências sugeridas
![Instalador do Lubuntu](imagens/05-instalador.png)

![Processo de instalação](imagens/06-instalacao.png)
🚀 6. Primeira inicialização
Depois da instalação, a máquina virtual foi reiniciada.

O Lubuntu passou a inicializar diretamente pelo disco virtual criado
anteriormente.

Após inserir usuário e senha, foi possível acessar a área de trabalho.

Resultado esperado
┌─────────────────────────────────┐
│         🐧 LUBUNTU              │
│                                 │
│     🖥️ Área de trabalho         │
│                                 │
│ 📁 Arquivos    🌐 Internet      │
│ ⚙️ Ajustes     ⌨️ Terminal      │
│                                 │
└─────────────────────────────────┘
📸 Evidência importante
![Área de trabalho do Lubuntu](imagens/07-desktop-lubuntu.png)
🧪 7. Testes e exploração do sistema
Com o sistema funcionando, foram exploradas algumas funcionalidades para
verificar se a virtualização estava funcionando corretamente.

🌐 7.1 Teste de Internet
Foi aberto o navegador para verificar o funcionamento da conexão de
rede.

Quando configurado adequadamente, o VirtualBox permite que a máquina
virtual utilize a conexão do computador host.

Resultado: conexão de rede disponível para utilização do sistema.

📁 7.2 Gerenciador de arquivos
O gerenciador de arquivos foi explorado para visualizar diretórios e
entender a organização do sistema Linux.

Alguns diretórios comuns são:

/
├── bin
├── boot
├── dev
├── etc
├── home
│   └── usuario
├── media
├── opt
├── tmp
├── usr
└── var
O diretório /home normalmente contém os arquivos pessoais dos
usuários.

⌨️ 7.3 Terminal
O terminal é uma ferramenta importante no Linux.

Alguns comandos básicos podem ser utilizados para explorar o sistema:

pwd
Mostra o diretório atual.

ls
Lista arquivos e diretórios.

cd
Permite navegar entre diretórios.

whoami
Mostra o usuário atual.

uname -a
Apresenta informações sobre o sistema e o kernel.

free -h
Mostra informações sobre utilização de memória.

df -h
Mostra informações sobre armazenamento.

🖥️ 7.4 Interface gráfica
Também foram explorados:

menu de aplicativos;

área de trabalho;

painel;

configurações;

gerenciador de arquivos;

navegador;

terminal;

opções de desligamento e reinicialização.

📊 Resultado dos testes
Teste Resultado esperado

🐧 Inicialização do Lubuntu ✅ Funcionando
🖥️ Interface gráfica ✅ Funcionando
⌨️ Teclado ✅ Funcionando
🖱️ Mouse ✅ Funcionando
🌐 Internet ✅ Funcionando
📁 Gerenciador de arquivos ✅ Funcionando
⌨️ Terminal ✅ Funcionando
🔄 Reinicialização ✅ Funcionando

📸 Evidências sugeridas
![Teste de Internet](imagens/08-internet.png)

![Teste do terminal](imagens/09-terminal.png)

![Gerenciador de arquivos](imagens/10-arquivos.png)
🏗️ Arquitetura da virtualização
O ambiente criado pode ser representado da seguinte forma:

flowchart TB
    HW["🖥️ Hardware físico<br/>CPU • RAM • SSD • Rede"]
    HOST["💻 Sistema Operacional Host"]
    VB["📦 Oracle VirtualBox"]
    VM["⚙️ Hardware Virtual<br/>vCPU • RAM • Disco • Rede"]
    LINUX["🐧 Lubuntu"]
    APPS["🧰 Aplicativos Linux"]

    HW --> HOST
    HOST --> VB
    VB --> VM
    VM --> LINUX
    LINUX --> APPS
O VirtualBox atua como uma camada entre o computador principal e o
sistema convidado.

📊 Recursos da máquina virtual
Uma forma simplificada de compreender a divisão de recursos é:

RECURSOS DO COMPUTADOR
████████████████████████████████████

Sistema Host
████████████████████████

Máquina Virtual
████████████

Dentro da VM:
├── 🧠 RAM virtual
├── ⚙️ CPU virtual
├── 💾 Disco virtual
├── 🌐 Adaptador de rede virtual
└── 🖥️ Adaptador gráfico virtual
A VM não é um computador físico separado, porém, para o sistema
operacional convidado, os recursos virtuais funcionam de maneira
semelhante aos componentes de um computador real.

🔗 Comunicação entre os componentes
sequenceDiagram
    participant U as 👤 Usuário
    participant V as 📦 VirtualBox
    participant VM as ⚙️ Máquina Virtual
    participant L as 🐧 Lubuntu
    participant H as 💻 Hardware

    U->>V: Inicializa a VM
    V->>H: Solicita recursos
    H-->>V: CPU, RAM e armazenamento
    V->>VM: Disponibiliza hardware virtual
    VM->>L: Inicializa o sistema
    L-->>U: Exibe ambiente Linux
⚖️ Sistema físico x Máquina virtual
Característica Sistema físico Máquina virtual

Hardware Real Virtualizado
CPU Física vCPU
Memória RAM física RAM reservada
Armazenamento SSD/HD Disco virtual
Rede Adaptador físico Adaptador virtual
Sistema Host Guest
Isolamento Sistema principal Ambiente separado
Flexibilidade Menor Alta

🌟 Vantagens da virtualização
A atividade permitiu observar diversas vantagens.

🔒 Isolamento
O sistema convidado funciona em um ambiente separado do sistema
principal.

🧪 Testes
É possível testar sistemas operacionais e softwares sem precisar
substituir o sistema instalado fisicamente.

🖥️ Vários sistemas
Um computador pode executar diferentes sistemas operacionais utilizando
máquinas virtuais.

📚 Aprendizado
A virtualização facilita estudos de:

Linux;

redes;

servidores;

sistemas operacionais;

desenvolvimento;

administração de sistemas.

🔄 Flexibilidade
Uma VM pode ser desligada, modificada, clonada ou removida sem precisar
alterar diretamente a instalação principal do computador.

⚠️ Possíveis problemas e soluções
Problema Possível solução

VM muito lenta Aumentar RAM/CPU dentro dos limites
do host

Lubuntu não inicia Conferir ISO e ordem de
inicialização

Sem Internet Conferir adaptador de rede/NAT

Tela pequena Ajustar resolução e recursos de
integração

Pouco armazenamento Aumentar o disco virtual quando
aplicável

Virtualização indisponível Verificar suporte/configuração de
virtualização do computador

🔐 Boas práticas
Durante a utilização de máquinas virtuais é recomendado:

não reservar todos os recursos do computador para uma única VM;

utilizar imagens ISO obtidas de fontes confiáveis;

manter espaço disponível no armazenamento;

desligar corretamente o sistema convidado;

manter senhas de usuário protegidas;

verificar as configurações antes de alterar discos virtuais;

criar snapshots antes de testes importantes, quando necessário.

📚 O que foi aprendido?
flowchart LR
    A[🎓 Atividade] --> B[Virtualização]
    A --> C[Linux]
    A --> D[VirtualBox]
    A --> E[Hardware]
    A --> F[Testes]

    B --> B1[Host e Guest]
    C --> C1[Lubuntu]
    C --> C2[Terminal]
    D --> D1[Criação de VM]
    D --> D2[Configuração]
    E --> E1[RAM]
    E --> E2[CPU]
    E --> E3[Disco]
    F --> F1[Internet]
    F --> F2[Arquivos]
    F --> F3[Aplicativos]
A atividade possibilitou compreender melhor a relação entre hardware
físico, sistema host, hipervisor, hardware virtual e sistema
convidado.

📝 Conclusão
A instalação do Lubuntu no Oracle VirtualBox permitiu colocar em
prática os conceitos de virtualização apresentados durante as aulas.

Foi possível acompanhar todas as etapas, desde a preparação do software
de virtualização até a criação da máquina virtual, configuração dos
recursos, instalação do sistema operacional e realização de testes.

O Lubuntu mostrou-se adequado para a atividade por ser uma distribuição
Linux relativamente leve e possuir interface gráfica, permitindo
explorar o sistema de maneira simples.

Além da instalação, a atividade ajudou a compreender conceitos como
host, guest, imagem ISO, memória virtual, processador virtual, disco
virtual e adaptador de rede virtual.

Por fim, os testes realizados demonstraram como uma máquina virtual pode
ser utilizada para aprendizado, testes e execução de outros sistemas
operacionais sem a necessidade de substituir diretamente o sistema
principal do computador.

✅ Checklist final
Oracle VirtualBox instalado

Distribuição Linux escolhida

Lubuntu utilizado

Imagem ISO obtida

Máquina virtual criada

Recursos da VM configurados

Lubuntu instalado

Sistema inicializado

Interface explorada

Terminal testado

Gerenciador de arquivos explorado

Rede testada

Processo documentado

Capturas de tela adicionadas ao repositório

Manual enviado ao repositório da disciplina

📂 Estrutura recomendada para o repositório
📦 atividade-virtualizacao
│
├── 📄 README.md
│
└── 📁 imagens
    ├── 01-virtualbox.png
    ├── 02-lubuntu-iso.png
    ├── 03-criacao-vm.png
    ├── 04-hardware-vm.png
    ├── 05-instalador.png
    ├── 06-instalacao.png
    ├── 07-desktop-lubuntu.png
    ├── 08-internet.png
    ├── 09-terminal.png
    └── 10-arquivos.png
📷 Como inserir suas próprias imagens
Salve as capturas dentro da pasta imagens e utilize:

![Descrição da imagem](imagens/nome-da-imagem.png)
Exemplo:

![Lubuntu executando no VirtualBox](imagens/07-desktop-lubuntu.png)
🏁 Resultado final
Oracle VirtualBox + Lubuntu = ambiente Linux virtualizado funcionando
com sucesso. 🐧✅

📌 Este manual documenta o processo de criação, instalação e
exploração da máquina virtual desenvolvido para a atividade da
disciplina.

