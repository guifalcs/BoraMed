# Impressão de simulados

A rota `/imprimir/simulado/montado` imprime o conjunto personalizado da sessão. A rota `/imprimir/simulado/:provaId` usa o mesmo documento para provas existentes. O navegador gera a impressão/PDF em A4, com margens verticais de 16 mm e laterais de 14 mm.

## Quebras de página

- Uma questão que cabe na área útil de uma folha permanece inteira; pode ser deslocada para a página seguinte.
- Uma questão maior que uma folha continua nas páginas seguintes. Nesse caso, cada alternativa, figura com legenda e conjunto de linhas manuscritas que couber em uma folha permanece inteiro.
- Uma alternativa maior que a folha pode continuar na próxima página. Não se usa altura fixa, `overflow: hidden` ou redução de fonte para forçá-la a caber.
- Cartão-resposta e gabarito começam em páginas novas. Explicações que cabem em uma página permanecem inteiras.

O fluxo principal usa `display: block` durante a impressão. A proteção de quebra alcança o host Angular da questão, além dos blocos internos. Proteger somente o artigo inteiro não protege as alternativas quando a questão é maior que uma folha: o navegador precisa desconsiderar essa restrição para conseguir paginar.

## Regressão automatizada

```bash
cd frontend
npm ci
npx playwright install chromium
npx playwright test impressao-paginacao --project=mocked --workers=1
```

O Playwright inicia o servidor E2E em `localhost:4210`. A suíte usa sessão e respostas de rede simuladas, sem precisar do banco local ou alterar dados. O CI executa a suíte junto com os testes de pagamento.

Os testes geram `test-results/<caso>/simulado.pdf` e usam PDF.js para verificar o conteúdo efetivamente paginado, em vez de depender de `emulateMedia('print')`, que sozinho mostra uma página contínua. Conferem presença única dos marcadores de texto, ordem, margens, ausência de páginas vazias, integridade das questões/alternativas, imagens e páginas separadas do cartão e gabarito.

Cobertura: três fontes, tema ligado/desligado, enunciado/texto de apoio/alternativa maiores que uma folha, questões próximas da altura útil, discursivas, imagens no enunciado e nas alternativas, viewports de 390/820/1024/1440 px, gabarito comentado e simulado de 100 questões.

O caso “questão extensa preserva cada alternativa que cabe em uma página” reproduz a divisão indevida de uma alternativa entre duas folhas antes da correção.

## Conferência visual

Abra os PDFs gerados e confira especialmente as últimas linhas e as primeiras linhas de cada página, as bolhas/letras das alternativas e as figuras. Para conferir uma impressora ou navegador específico, abra as duas rotas no navegador de destino e use a visualização de impressão em A4, escala de 100%, sem cabeçalhos/rodapés adicionais. Testes de PDF do Chromium não comprovam, por si só, o comportamento de toda combinação de navegador, driver e impressora.

`PRINT_HTML_SNAPSHOT=1` no comando de teste também salva `simulado.html` com a marcação e os estilos daquele caso, sem scripts. Com o servidor E2E ainda ligado, esse arquivo permite conferir a mesma composição no print nativo de outro navegador. Imagens servidas por mocks exigem que o respectivo recurso também esteja disponível nesse navegador.

Na validação de 2026-11-01, o caso da questão extensa também foi impresso em PDF pelo Firefox 158 via WebDriver: as cinco alternativas ficaram inteiras, em cinco páginas no total. As páginas do Chromium antes/depois foram rasterizadas e revisadas visualmente.
