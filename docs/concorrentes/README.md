# Concorrentes e referências de mercado

Material de ferramentas de terceiros que fazem, no todo ou em parte, o que o fasor pretende fazer: gerar relatórios técnicos de engenharia elétrica. Serve para **análise de concorrente** — ver como o mercado está resolvendo o problema, o que já é obrigatório ter (table stakes) e onde sobra espaço.

Nada aqui é decisão de produto. As decisões que saíram dessas análises estão nos spines de UX (`_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/`), no brief e no PRD, sempre com a origem citada.

## Como esse material chegou

Pelo grupo de WhatsApp de engenheiros de que o Bruno Matsui (Fasor Engenharia, parceiro de design e primeiro usuário) participa. As ferramentas circulam ali para avaliação entre pares, e é também o canal onde os autores as vendem. O Matheus repassou o material para que o mercado fosse lido antes de fechar o escopo.

Esse canal importa por si só: o brief registra que o fasor **não tem audiência própria**, e que a boca a boca nesses grupos é o canal mais próximo que se observou funcionando — um depoimento rendeu cerca de seis usuários para a ferramenta da RAAD.

## O que tem aqui

### `extract-media-reference-tool.md` + `frames-reference-tool/`

**"Estudo de Carga e Demanda", da RAAD Engenharia.** Compositor de documento de página única, roda no navegador. Enviado pelo Bruno em 18/09/2026 (dois vídeos de tela sem áudio e dois áudios PTT, originais em `docs/media/`).

Medido nos frames: sem login, sem home, sem projetos, sem árvore, sem offline, sem sync, sem backend — XLSX é lido no cliente com SheetJS e "Salvar projeto" / "Salvar HTML" gravam arquivo local. O sumário **é** o editor de estrutura (abrir, subir, descer, excluir por linha, numeração automática). Reordena digitando o número. Os dados chegam por arquivo de memória de massa do medidor, não do campo. A saída do segundo vídeo é de **outra empresa** (MEGA INSTALAÇÕES), o que mostra que a ferramenta é multiempresa por troca de logo.

**Ressalva importante de leitura.** Não é um concorrente direto: é outro tipo de relatório (estudo de carga e demanda, não manutenção preventiva de cabine primária), é desktop, e não encosta em captura de campo — que é justamente a dor do Bruno. O registro de 18/09 no memlog dizia "reference for the project, not a competitor"; o Matheus revisou isso em 19/09: o material está aqui **como análise de concorrente**, para ler o mercado.

O que ele é, com precisão: a melhor evidência disponível do que um desenvolvedor sozinho consegue colocar nesse mercado e receber por isso — um compositor de uma página com gerador, e nenhuma das partes difíceis. Isso não conclui que o fasor deva largar a captura offline; conclui que **o que as pessoas pagam é o documento gerado**.

Subpastas:

- `frames-reference-tool/*.jpg` — sete frames curados na análise de 18/09 (capa, app, mapeamento de colunas, KPIs de disjuntor, laudo gerado, matriz de risco, controle do documento).
- `frames-reference-tool/densa-2026-09-19/` — passada densa de 19/09: 68 quadros a 1 fps, reduzidos a duas folhas de contato e seis stills que carregam o modelo de interação (lista de unidades com resumo vivo, sumário como editor de estrutura, identificação e configuração de disjuntor, mapeamento de colunas, foto por página com carimbo, controle do documento).

### `extract-fotos-whatsapp.md`

**GroundPRO (Elétrica Academy) e Mesh Tool Factory / Megabras.** Onze capturas de tela recebidas pelo mesmo grupo, analisadas em 18/09/2026.

Esses dois **são** concorrentes diretos — o brief registra a Mesh Labs lançando um app de cabine primária em setembro de 2026 por R$ 1.397/ano, e o GroundPRO anunciando checklists. O que foi aproveitado (home como painel de status, "Rascunho encontrado — Recuperar", bandas de seção numeradas, critério de aceitação mostrado onde o valor é digitado, TAG como identificador, contador de campos obrigatórios) e o que foi rejeitado (o tema escuro/verde, o dashboard de cards, portabilidade por arquivo) está em `EXPERIENCE.md` § Inspiration & Anti-patterns.

O arquivo também sinaliza, no item 1, um comprovante Pix pessoal que entrou por engano em `docs/context/` e deveria ser removido de lá.

## Dados de terceiros

O relatório mostrado no segundo vídeo da RAAD contém dados reais de terceiros — razões sociais, CNPJs, nomes e registros profissionais de empresas que não são a Fasor nem o cliente dela, além de coordenadas GPS de instalações. Estão citados nas análises só no necessário. **Não propagar para documentos públicos, propostas ou material de venda.**

## Onde o cenário competitivo é acompanhado de verdade

Esta pasta guarda o material bruto e sua leitura. O panorama, com datas de revalidação, está em:

- `_bmad-output/planning-artifacts/research/competitive-laudos-cabine-primaria-2026-09-18/research.md`
- `_bmad-output/planning-artifacts/research/market-laudos-eletricos-em-campo-2026-09-18/research.md`
- O brief, em "What Makes This Different" (o que é table stakes e o que é diferencial) e em "Open Questions and Risks" (janela competitiva, canal).

Concorrentes acompanhados hoje: Mesh Labs, GroundPRO (Elétrica Academy), Minipa Link, Inspekio, e desenvolvedores solo vendendo dentro dos grupos. Ferramentas novas que chegarem pelo grupo entram aqui, uma pasta ou um arquivo por ferramenta.

## O que não é isto

`imports/extract-fo-serv-03.md` e `imports/fichas-fo-serv-03/`, na pasta de UX, **não** vieram para cá: são a extração estrutural do FO.SERV-03, o formulário da própria Fasor, que é a fonte do produto e não um concorrente. O original fica em `docs/context/`.
