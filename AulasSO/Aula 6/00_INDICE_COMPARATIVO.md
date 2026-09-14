# 🐧 Sistemas Operacionais Linux --- Índice dos Guias

  --------------------------------------------------------------------------
  Sistema           Foco principal    Desktop              Família
  ----------------- ----------------- -------------------- -----------------
  🐉 Kali Linux     Segurança /       Xfce                 Debian
                    pentest                                
                    autorizado                             

  🪶 Lubuntu        Leveza / desktop  LXQt                 Ubuntu

  ✨ Zorin OS 18    Facilidade /      GNOME/Xfce           Ubuntu
                    migração do                            
                    Windows                                

  🌿 Linux Mint     Desktop amigável  Cinnamon/MATE/Xfce   Ubuntu
                    / estabilidade                         

  🎩 Fedora         Tecnologias       GNOME                Fedora/RPM
  Workstation       recentes /                             
                    desenvolvimento                        
  --------------------------------------------------------------------------

``` mermaid
flowchart TD
LINUX[🐧 Linux] --> DEB[Debian]
LINUX --> RH[Ecossistema Fedora/RPM]
DEB --> KALI[Kali]
DEB --> UB[Ubuntu]
UB --> LUB[Lubuntu]
UB --> ZOR[Zorin OS 18]
UB --> MINT[Linux Mint]
RH --> FED[Fedora Workstation]
```

## 🎯 Qual escolher para estudar?

-   **Kali:** segurança e redes em laboratório autorizado.
-   **Lubuntu:** Linux leve e simples para VM.
-   **Zorin OS 18:** interface amigável e transição do Windows.
-   **Mint:** desktop tradicional, estável e fácil.
-   **Fedora:** desenvolvimento e tecnologias Linux recentes.

Abra o arquivo específico de cada sistema para encontrar o tutorial
completo de instalação no Oracle VirtualBox.
