# Workflow de Desenvolvimento — Rebuild

> Este documento descreve o processo de desenvolvimento de features, correções e ajustes.
> É a referência humana para o fluxo que os slash commands automatizam.

## Comandos Disponíveis

| Comando | Quando usar | Complexidade |
|---------|-------------|--------------|
| `/implement-feature` | Feature completa ponta a ponta (front + back + integração) | Alta |
| `/implement` | Entrega parcial — só front, só back, um componente, uma migration | Média |
| `/fix-bug` | Correção de bug com investigação de causa raiz | Média |
| `/tweak` | Ajuste visual, texto, espaçamento, coisas sem lógica | Baixa |
| Conversa direta | Perguntas, dúvidas, exploração, coisas triviais | Mínima |

## Fluxo Completo (/implement-feature)

```
Você descreve a feature
       ↓
[architect] planeja (read-only)
       ↓
Você aprova o plano
       ↓
[implementer] cria frontend com mock → commit
       ↓
Você testa frontend (Storybook + Preview Vercel)
       ↓
[implementer] cria backend (migration + edge function) → commit
       ↓
Você testa backend
       ↓
[implementer] integra front ↔ back → commit
       ↓
Você testa fluxo completo
       ↓
[tester] escreve e roda testes → commit
       ↓
[reviewer] analisa qualidade e segurança
       ↓
Você aprova → push + PR
       ↓
GitHub Actions roda CI → Vercel gera preview
       ↓
Você revisa PR → merge
       ↓
GitHub Actions deploya para produção
```

## Regras do Processo

1. **Nunca pular etapas** — cada checkpoint existe por um motivo
2. **Commit a cada etapa aprovada** — protege contra perda de progresso
3. **Sempre em branch** — nunca na main diretamente
4. **Changelog atualizado** — ao final de cada feature/fix/tweak
5. **Story para todo componente novo** — sem exceções
6. **Testes para toda lógica nova** — sem exceções
7. **Deploy para prod só via CI/CD** — nunca manual pelo Claude Code

## Dicas de Uso

- **Seja específico nas descrições** — quanto mais detalhes, menos iterações
- **Liste todos os ajustes de uma vez** — em vez de um por mensagem
- **Use imagens** — arraste screenshots e mockups para contextualizar
- **Quebre módulos grandes** — em vez de pedir tudo de uma vez, quebre em /implement menores
- **Entre tasks diferentes, use /clear** — reseta o contexto para a próxima tarefa
