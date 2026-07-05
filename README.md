# 🎓 Editais Pós-Graduação Bahia | Monitor de Oportunidades Acadêmicas
> **Projeto desenvolvido sob a chancela 🔬 YLuna85 LABs**


Sistema de monitoramento e acompanhamento de editais de mestrado, doutorado e especializações em universidades e institutos públicos da Bahia (UFBA, IF Baiano, IFBA, UESB, UESC, UEFS, UNEB).

---

## 📌 Sobre a Aplicação
Plataforma desenvolvida para centralizar a busca de seleções acadêmicas e cursos de pós-graduação, facilitando o acesso de professores, pesquisadores e estudantes às oportunidades da Rede Federal e Estadual da Bahia.

## ✨ Funcionalidades Principais
- 📜 **Painel de Editais**: Listagem de processos seletivos abertos com links diretos para os arquivos oficiais.
- 📱 **Design Adaptativo**: Layout Mobile-First perfeito para navegação em celulares.

## 🛠️ Tecnologias Utilizadas
- **Frontend**: HTML5, Vanilla CSS3, JavaScript (ES6+).

---

## 📜 Log de Atualizações (Changelog)

### 📅 05/07/2026 - Restruturação do Portal & Integração de APIs (Serper & ScraperAPI)
- 🎓 **Filtro Stricto e Lato Sensu**: Reestruturação das abas principais de Mestrado e Doutorado para "Stricto Sensu" (Mestrado, Doutorado e Pós-Doc) e "Lato Sensu" (Especializações).
- 🔑 **Integração de APIs de Busca e Proxy**: Implementação de busca programática no Google via **Serper.dev** para detecção de editais externos de forma dinâmica e integração com a **ScraperAPI** como proxy de fallback para contornar bloqueios e instabilidades de rede.
- ⚙️ **Automação no Compilador**: Mapeamento das rotinas de coleta do SIGAA para incluir o nível Lato Sensu (`nivel=L`) e enriquecimento dinâmico de campos nos metadados (`tipo_pos`, `modalidade`, `gratuidade`, `is_ept`).
- 🛠️ **Filtros Lato Sensu Avançados**: Implementação de seletores interativos na interface para classificar por Modalidade (EaD/Presencial), Foco em EPT (Pós em Gestão/Docência na EPT vs outras EaD) e Investimento (Cursos Gratuitos vs Pagos).
- 🏷️ **Badges Dinâmicos nos Cards**: Inserção de tags visuais com as novas propriedades dos processos seletivos diretamente nos cards de visualização rápida.

### 📅 30/06/2026 - Estruturação de SEO & Monetização
- 🌐 **Otimização de SEO (White Hat)**: Inclusão de meta tags de indexação, dados estruturados JSON-LD e tags Open Graph (OG) para melhorar a relevância e indexação orgânica no Google.
- 💵 **Estrutura de Monetização**: Adicionados slots de publicidade responsivos (banner horizontal e lateral) compatíveis com o modo de alto contraste para Google AdSense e AdMob.



### 📅 27/06/2026 - Recursos de Acessibilidade (A11y)
- ♿ **Acessibilidade Universal (A11y/WCAG)**: Adicionada barra flutuante de acessibilidade com **A+/A- (Ajuste de Fonte)** e modo **Alto Contraste (☯)**.

### 📅 27/06/2026 - Padronização & Responsividade Mobile-First
- 📱 **Otimização Multi-Telas**: Garantia de alinhamento e leitura fluida em smartphones na vertical.
- 📚 **Documentação Oficial**: Criação do arquivo `README.md` completo com log de atualizações.
