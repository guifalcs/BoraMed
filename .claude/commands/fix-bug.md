Corrija o seguinte bug:

**Problema:** $ARGUMENTS

---

## Processo:

1. **Investigue** a causa raiz — leia os arquivos relevantes, entenda o fluxo que está falhando
2. **Identifique** exatamente onde está o problema antes de propor correção
3. **Corrija** o código com a menor mudança possível
4. Rode os **testes relacionados** para confirmar que a correção funciona
5. Verifique se a correção não **quebrou** outros fluxos rodando `cd frontend && ng test`
6. **PARE** e peça ao usuário para validar a correção
7. Após aprovação, faça **commit**: `fix(escopo): descrição` em português
8. Adicione entrada no **CHANGELOG.md**: data, tipo (Fix), resumo, hash do commit

IMPORTANTE: Nunca proponha uma correção sem antes entender a causa raiz. Evite tentativa e erro.
