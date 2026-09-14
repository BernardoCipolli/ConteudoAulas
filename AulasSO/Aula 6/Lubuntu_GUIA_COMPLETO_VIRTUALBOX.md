# 🪶 Lubuntu --- Guia Completo + Oracle VirtualBox

> 📚 Material de estudo: conceito, arquitetura, comandos, instalação em
> máquina virtual, mapas mentais, tabelas, fluxogramas, solução de
> problemas e revisão.

------------------------------------------------------------------------

## 🧭 Visão rápida

  -----------------------------------------------------------------------
  Item                                Resumo
  ----------------------------------- -----------------------------------
  🧬 Base                             Ubuntu

  🖼️ Desktop                          LXQt

  🎯 Foco                             Desktop Linux leve, rápido e
                                      funcional para uso cotidiano e
                                      máquinas virtuais.

  📦 Pacotes                          APT / dpkg + Discover

  🧠 RAM da VM                        2 GB funciona para estudo; 4 GB
                                      recomendado para experiência mais
                                      confortável

  ⚙️ CPU da VM                        2 vCPUs

  💽 Disco                            25--40 GB recomendado para
                                      laboratório
  -----------------------------------------------------------------------

## 📜 História e origem

Sabor oficial do Ubuntu reconhecido desde 11.10. Usava LXDE e migrou
para LXQt a partir de 18.10. A linha 26.04 LTS usa LXQt 2.3 e tem
suporte até abril de 2029.

## 🎯 Onde é usado

-   Computadores com recursos modestos
-   Máquinas virtuais
-   Estudo de Linux
-   Navegação e produtividade
-   Ambiente leve para desenvolvimento

## 🧠 Mapa mental

``` mermaid
mindmap
  root((Lubuntu))
    Fundamentos
      Kernel Linux
      Processos e threads
      Memória virtual
      Sistema de arquivos
    Interface
      LXQt
      Terminal
      Configurações
    Software
      APT / dpkg + Discover
      Repositórios
      Atualizações
    VirtualBox
      ISO
      Disco VDI
      RAM e CPU
      Guest Additions
    Uso
      Estudo
      Laboratório
      Desenvolvimento
```

------------------------------------------------------------------------

# 1. 🐧 Fundamentos do sistema operacional

Linux é o **kernel**: a parte que controla CPU, memória, dispositivos,
processos, permissões e comunicação com hardware. A distribuição combina
esse kernel com ferramentas GNU, bibliotecas, gerenciador de pacotes,
ambiente gráfico e aplicações.

### Fluxo simplificado

``` mermaid
flowchart TD
U[👤 Usuário] --> A[🪟 Aplicativos]
A --> L[📚 Bibliotecas / APIs]
L --> K[🐧 Kernel Linux]
K --> CPU[⚙️ CPU]
K --> RAM[🧠 RAM]
K --> DISK[💽 Disco]
K --> NET[🌐 Rede]
K --> DEV[⌨️ Dispositivos]
```

### Conceitos essenciais

  Conceito          Ideia
  ----------------- -------------------------------------------------
  Kernel            Núcleo que gerencia hardware e recursos
  Processo          Programa em execução
  Thread            Fluxo de execução dentro de um processo
  PID               Identificador de processo
  Memória virtual   Espaço de endereços apresentado a cada processo
  Filesystem        Organização lógica dos arquivos
  Usuário/root      Modelo de identidade e privilégios
  Shell             Interface de comandos
  Serviço/daemon    Processo de sistema executado em segundo plano

------------------------------------------------------------------------

# 2. 📁 Estrutura de diretórios

``` text
/
├── home/       👤 arquivos dos usuários
├── etc/        ⚙️ configurações
├── var/        📈 logs e dados variáveis
├── usr/        📦 programas e bibliotecas
├── bin/        🛠️ comandos essenciais
├── boot/       🚀 arquivos de inicialização
├── dev/        💾 dispositivos
├── proc/       🔎 informações de processos/kernel
├── tmp/        🗑️ temporários
└── root/       🔐 home do superusuário
```

> 💡 **Lógica:** no Linux, grande parte dos recursos é apresentada
> através de arquivos, diretórios e interfaces padronizadas.

------------------------------------------------------------------------

# 3. 💻 Terminal --- comandos essenciais

  Objetivo          Comando
  ----------------- ---------------------
  Onde estou?       `pwd`
  Listar            `ls -lah`
  Entrar em pasta   `cd pasta`
  Criar pasta       `mkdir projeto`
  Copiar            `cp origem destino`
  Mover/renomear    `mv origem destino`
  Remover arquivo   `rm arquivo`
  Ver arquivo       `cat arquivo`
  Espaço em disco   `df -h`
  RAM               `free -h`
  Processos         `ps aux`
  Monitorar         `top`
  IP                `ip addr`
  Testar rede       `ping -c 4 1.1.1.1`
  Identidade        `whoami`
  Kernel            `uname -a`

### ⚠️ Regra de segurança

`sudo` executa comandos com privilégios elevados. Antes de usar
`sudo rm`, alterar partições, permissões ou serviços, confirme o caminho
e entenda o efeito.

------------------------------------------------------------------------

# 4. 📦 Pacotes e atualizações

Atualizar o sistema:

``` bash
sudo apt update && sudo apt full-upgrade -y
```

Instalar um pacote:

``` bash
sudo apt install <pacote>
```

### Fluxo do gerenciador de pacotes

``` mermaid
flowchart LR
A[Você pede um pacote] --> B[Gerenciador]
B --> C[Repositórios]
C --> D[Dependências]
D --> E[Download]
E --> F[Verificação]
F --> G[Instalação]
```

------------------------------------------------------------------------

# 5. 🧰 Aplicativos e ferramentas

-   **PCManFM-Qt --- arquivos**
-   **Discover --- central de software**
-   **LibreOffice --- produtividade**
-   **Firefox --- navegador**
-   **QTerminal --- terminal**

------------------------------------------------------------------------

# 6. 🖥️ Oracle VirtualBox --- conceitos

Uma **máquina virtual (VM)** simula um computador dentro do computador
físico.

``` mermaid
flowchart TD
H[💻 Hardware real] --> HOST[🪟 Sistema hospedeiro]
HOST --> VB[📦 Oracle VirtualBox]
VB --> VM[🖥️ Máquina virtual]
VM --> GUEST[Lubuntu]
```

  Termo             Significado
  ----------------- --------------------------------------------
  Host              Seu Windows/Linux real
  Guest             SO dentro da VM
  ISO               Imagem do instalador
  VDI               Disco virtual do VirtualBox
  Snapshot          Ponto de restauração da VM
  NAT               VM acessa internet através do host
  Bridge            VM aparece mais diretamente na rede física
  Host-only         Rede privada entre host e VMs
  Guest Additions   Drivers/integrações do VirtualBox

------------------------------------------------------------------------

# 7. ✅ Antes de instalar

1.  Ative **Intel VT-x / AMD-V** na BIOS/UEFI se a virtualização não
    estiver disponível.
2.  Instale o **Oracle VirtualBox**.
3.  Baixe a ISO **somente da fonte oficial**.
4.  Se o projeto fornecer checksum, verifique a ISO.
5.  Reserve RAM e espaço sem comprometer o Windows hospedeiro.

### Configuração recomendada

  -----------------------------------------------------------------------
  Configuração                        Valor
  ----------------------------------- -----------------------------------
  Nome                                `Lubuntu`

  Tipo/versão                         `Linux → Ubuntu (64-bit)`

  RAM                                 2 GB funciona para estudo; 4 GB
                                      recomendado para experiência mais
                                      confortável

  Processadores                       2 vCPUs

  Disco                               25--40 GB recomendado para
                                      laboratório

  Formato                             VDI

  Alocação                            Dinamicamente alocado

  Vídeo                               128 MB

  Rede inicial                        NAT
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 8. 🛠️ Tutorial completo --- criar a VM

## Etapa 1 --- Nova máquina

1.  Abra **Oracle VM VirtualBox**.
2.  Clique em **Novo / New**.
3.  Digite o nome `Lubuntu`.
4.  Selecione a ISO baixada.
5.  Se aparecer **Unattended Installation**, você pode desmarcar/pular
    para acompanhar manualmente todas as telas do instalador.
6.  Confira o tipo: **Linux → Ubuntu (64-bit)**.

## Etapa 2 --- Hardware

-   Defina a RAM conforme a tabela.
-   Comece com **2 vCPUs**.
-   Não entregue à VM todos os núcleos nem toda a RAM do computador.
-   Se o host ficar lento, reduza recursos.

## Etapa 3 --- Disco virtual

``` mermaid
flowchart LR
A[Criar disco] --> B[VDI]
B --> C[Dinâmico]
C --> D[Definir tamanho]
D --> E[Arquivo .vdi]
```

Escolha **VDI** e **dinamicamente alocado**. O tamanho configurado é o
limite; o arquivo cresce conforme os dados são gravados.

## Etapa 4 --- Tela e rede

Em **Configurações → Tela**, use memória de vídeo adequada. Em **Rede**,
NAT é a opção mais simples para uma VM acadêmica.

## Etapa 5 --- Montar ISO

Se a ISO não estiver anexada:

**Configurações → Armazenamento → Unidade óptica → Escolher arquivo de
disco → ISO**

Depois clique em **Iniciar**.

------------------------------------------------------------------------

# 9. 🚀 Instalação do Lubuntu

### Fluxo geral

``` mermaid
flowchart TD
A[▶️ Iniciar VM] --> B[💿 Boot pela ISO]
B --> C[🌎 Idioma]
C --> D[⌨️ Teclado]
D --> E[🌐 Rede / localização]
E --> F[💽 Disco virtual]
F --> G[👤 Usuário e senha]
G --> H[📦 Copiar/instalar sistema]
H --> I[🔄 Reiniciar]
I --> J[💿 Remover/desmontar ISO]
J --> K[✅ Primeiro boot]
```

Como o disco é **virtual**, a opção do instalador equivalente a "apagar
disco e instalar" apaga somente o VDI selecionado --- desde que você
esteja realmente instalando dentro da VM e tenha escolhido o disco
virtual correto.

### Durante o instalador

1.  Escolha **Português (Brasil)** se desejar.
2.  Confira teclado **Português (Brasil / ABNT2)**.
3.  Use o particionamento automático para laboratório.
4.  Crie nome, usuário, hostname e senha.
5.  Aguarde a cópia dos arquivos.
6.  Reinicie.
7.  Se voltar ao instalador, desligue a VM e desmonte a ISO da unidade
    óptica.

------------------------------------------------------------------------

# 10. 🧩 Guest Additions

**Objetivo:** melhorar redimensionamento de tela, integração do mouse,
clipboard e pastas compartilhadas.

Para este sistema:

``` text
No VirtualBox: Dispositivos → Inserir imagem de CD dos Adicionais para Convidado; se necessário instale headers/build tools antes de executar o instalador.
```

Depois reinicie a VM.

### Clipboard

VirtualBox → **Configurações → Geral → Avançado → Área de Transferência
Compartilhada → Bidirecional**

> 🔐 Em laboratórios de segurança, prefira deixar clipboard e
> drag-and-drop desativados quando quiser maior isolamento.

------------------------------------------------------------------------

# 11. 🌐 Modos de rede

  Modo                 Internet   Host ↔ VM   VM visível na LAN Uso
  ------------------ ---------- ----------- ------------------- ----------------------
  NAT                        ✅    limitado                  ❌ uso comum
  Bridge                     ✅          ✅                  ✅ servidor/lab de rede
  Host-only                ❌\*          ✅                  ❌ laboratório isolado
  Internal Network           ❌          ❌                  ❌ VMs entre si

`*` Pode ser combinado com outro adaptador NAT.

### Escolha lógica

``` mermaid
flowchart TD
A[Precisa apenas de internet?] -->|Sim| NAT[NAT]
A -->|Não| B[Precisa aparecer na LAN?]
B -->|Sim| BR[Bridge]
B -->|Não| C[Host precisa falar com a VM?]
C -->|Sim| HO[Host-only]
C -->|Não| IN[Internal Network]
```

------------------------------------------------------------------------

# 12. 📸 Snapshots

Crie snapshot quando a VM estiver funcionando bem:

**Máquina → Snapshots → Tirar snapshot**

Exemplos: - `01-instalacao-limpa` - `02-atualizado` -
`03-antes-do-laboratorio`

> Snapshot não substitui backup. Ele é ótimo para voltar rapidamente a
> um estado anterior da VM.

------------------------------------------------------------------------

# 13. 🔧 Pós-instalação

``` bash
sudo apt update && sudo apt full-upgrade -y
```

Depois:

-   confirme resolução;
-   teste áudio;
-   teste rede;
-   configure fuso horário;
-   instale atualizações;
-   crie snapshot;
-   instale apenas os programas necessários.

------------------------------------------------------------------------

# 14. 🧯 Solução de problemas

## Não aparece opção 64-bit

-   confirme VT-x/AMD-V na BIOS/UEFI;
-   reinicie o host;
-   confira conflitos de hipervisor no Windows;
-   use uma versão atual do VirtualBox.

## Tela preta ou travando

-   desligue a VM;
-   teste outro controlador gráfico compatível;
-   reduza/desative aceleração 3D;
-   aumente memória de vídeo;
-   teste modo gráfico seguro quando a distribuição oferecer.

## VM lenta

``` mermaid
flowchart TD
A[VM lenta] --> B{Host está sem RAM?}
B -->|Sim| C[Reduzir RAM da VM / fechar apps]
B -->|Não| D{CPU em 100%?}
D -->|Sim| E[Ajustar vCPUs / carga]
D -->|Não| F{Disco saturado?}
F -->|Sim| G[Liberar espaço / verificar host]
F -->|Não| H[Atualizar sistema e Guest Additions]
```

## Sem internet

1.  Verifique **Adaptador 1 = NAT**.
2.  Dentro da VM:

``` bash
ip addr
ip route
ping -c 4 1.1.1.1
```

3.  Se IP funciona mas nomes não:

``` bash
ping -c 4 example.com
```

Isso ajuda a separar problema de conectividade de problema de DNS.

## Boot volta para ISO

Desmonte a ISO após a instalação ou coloque **Hard Disk** antes de
**Optical** na ordem de boot.

------------------------------------------------------------------------

# 15. 🔐 Permissões Linux

``` text
r = read    (4)
w = write   (2)
x = execute (1)
```

Exemplo:

``` bash
ls -l
chmod 755 script.sh
```

``` text
755 = dono: rwx | grupo: r-x | outros: r-x
```

Nunca use `chmod 777` como solução automática. Dê somente as permissões
necessárias.

------------------------------------------------------------------------

# 16. ⚙️ Processos e serviços

``` bash
ps aux
top
systemctl --type=service
systemctl status <servico>
journalctl -b
```

``` mermaid
flowchart LR
BOOT[Boot] --> K[Kernel]
K --> INIT[systemd]
INIT --> S[Serviços]
S --> LOGIN[Login]
LOGIN --> DESK[Desktop / Shell]
```

------------------------------------------------------------------------

# 17. 📝 Comparação: VM x instalação física

  Critério                   VM            Instalação física
  -------------------------- ------------- -------------------
  Segurança para testar      ⭐⭐⭐⭐⭐    ⭐⭐
  Desempenho                 ⭐⭐⭐        ⭐⭐⭐⭐⭐
  Snapshot                   Fácil         Não nativo
  Acesso direto a hardware   Limitado      Completo
  Reinstalação               Muito fácil   Mais trabalhosa
  Ideal para aula            ✅            depende

------------------------------------------------------------------------

# 18. 🎓 Roteiro para apresentação

1.  **O que é o sistema?**
2.  **Origem e evolução**
3.  **Base e ambiente gráfico**
4.  **Características principais**
5.  **Gerenciamento de software**
6.  **Aplicativos**
7.  **Casos de uso**
8.  **Vantagens e limitações**
9.  **Virtualização**
10. **Demonstração da VM**
11. **Conclusão**

------------------------------------------------------------------------

# 19. 🧠 Revisão rápida

-   [ ] Sei explicar o que é kernel.
-   [ ] Sei diferenciar host e guest.
-   [ ] Sei explicar ISO e VDI.
-   [ ] Sei criar uma VM do zero.
-   [ ] Sei escolher RAM, CPU e disco.
-   [ ] Sei diferenciar NAT, Bridge e Host-only.
-   [ ] Sei atualizar o sistema.
-   [ ] Sei instalar um pacote.
-   [ ] Sei usar comandos básicos.
-   [ ] Sei criar snapshot.
-   [ ] Sei explicar vantagens e limitações do Lubuntu.

------------------------------------------------------------------------

# 20. 📚 Fontes oficiais

-   [Site oficial](https://lubuntu.me/)
-   [Manual oficial](https://manual.lubuntu.me/stable/)
-   [Instalação](https://manual.lubuntu.me/stable/1/1.3/installation.html)

> 📅 Conteúdo preparado em setembro de 2026. Versões, telas do
> instalador e nomes de opções podem mudar; para instalação real,
> confira a documentação oficial da versão que você baixou.
