# Evidência visual por entrega

Cada incremento de interface do OmniForge deve incluir capturas do aplicativo executando,
produzidas pelo teste Electron da mesma revisão proposta para entrega.

- Não usar imagens geradas como prova de implementação.
- Usar projetos temporários identificados como testes; não expor caminhos pessoais, chaves, arquivos privados ou tokens.
- Registrar tamanho da janela, versão, comandos executados e arquivo da captura.
- Exercitar a ação antes de capturar: abrir um painel não prova persistência, execução ou exportação.
- Verificar os bytes/documentos resultantes nos testes quando aplicável.
- Revisar ao menos uma janela padrão e uma compacta; conferir recortes, sobreposições e legibilidade.
- Recursos sem interface devem ter logs/resultados reais; não inventar uma tela para aparentar uma implementação visual.
- Falha em um gate impede declarar o incremento aprovado, mesmo que exista uma captura bonita.

Introduzido na v0.8.1 por solicitação do usuário. Capturas são evidência dos cenários demonstrados,
não garantia universal de qualidade, segurança ou ausência de defeitos.
