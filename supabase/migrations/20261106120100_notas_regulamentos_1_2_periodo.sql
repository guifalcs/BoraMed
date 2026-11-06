-- ════════════════════════════════════════════════════════════════════════════
-- Minhas notas: regulamentos do 1º e 2º período (2026.2)
--
-- Conteúdo dos regulamentos do sistema de avaliação 2026.2 enviados pela
-- equipe (Arthur): composição de SOI, HAM, IESC, MCM e PIEPE, já PUBLICADOS.
-- Daqui em diante, novos períodos/semestres entram pelo /admin/notas ou pelo
-- MCP (`criar_dimensoes_nota`), nunca por migration.
--
-- Idempotente: pula o período/semestre que já tiver regulamento (ex.: se o
-- admin cadastrou antes do deploy).
-- ════════════════════════════════════════════════════════════════════════════
DO $do$
DECLARE
  v_regs   JSONB := $regs$[
 {
  "periodo": 1,
  "semestre": "2026.2",
  "fonte": "Regulamento do sistema de avaliação 2026.2",
  "observacao": "Composição divulgada aos alunos no regulamento do sistema de avaliação 2026.2 (unidade Ipatinga). Frequência mínima de 75% em todos os eixos.",
  "eixos": [
   {
    "sigla": "SOI I",
    "nome": "Sistemas Orgânicos Integrados I",
    "exame_especial": true,
    "dimensoes": [
     {
      "tipo": "cognitiva",
      "itens": [
       {
        "nome": "Prova N1",
        "pontos": 20
       },
       {
        "nome": "TPI",
        "pontos": 30,
        "descricao": "Teste de Progresso Institucional"
       },
       {
        "nome": "Prova N2",
        "pontos": 35
       },
       {
        "nome": "Prova N3",
        "pontos": 15
       }
      ]
     },
     {
      "tipo": "habilidades",
      "itens": [
       {
        "nome": "Avaliação Diária na APG",
        "pontos": 35,
        "subitens": [
         {
          "nome": "1ª parcial",
          "pontos": 20
         },
         {
          "nome": "2ª parcial",
          "pontos": 15
         }
        ]
       },
       {
        "nome": "Avaliações em Multiestações",
        "pontos": 30,
        "subitens": [
         {
          "nome": "1ª multiestação",
          "pontos": 15
         },
         {
          "nome": "2ª multiestação",
          "pontos": 15
         }
        ]
       },
       {
        "nome": "Avaliação Diária nos Laboratórios",
        "pontos": 30,
        "descricao": "Avaliações práticas contínuas",
        "subitens": [
         {
          "nome": "Laboratório 1",
          "pontos": 10
         },
         {
          "nome": "Laboratório 2",
          "pontos": 10
         },
         {
          "nome": "Laboratório 3",
          "pontos": 10
         }
        ]
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   },
   {
    "sigla": "HAM I",
    "nome": "Habilidades e Atitudes Médicas I",
    "exame_especial": true,
    "dimensoes": [
     {
      "tipo": "cognitiva",
      "itens": [
       {
        "nome": "Prova N1",
        "pontos": 20
       },
       {
        "nome": "TPI",
        "pontos": 30,
        "descricao": "Teste de Progresso Institucional"
       },
       {
        "nome": "Prova N2",
        "pontos": 35
       },
       {
        "nome": "Prova N3",
        "pontos": 15
       }
      ]
     },
     {
      "tipo": "habilidades",
      "itens": [
       {
        "nome": "Avaliação Diária",
        "pontos": 40,
        "subitens": [
         {
          "nome": "Conhecimento aplicado",
          "pontos": 20
         },
         {
          "nome": "Rubrica semanal de habilidades e atitudes",
          "pontos": 20
         }
        ]
       },
       {
        "nome": "OSCE",
        "pontos": 55,
        "descricao": "Avaliação prática padronizada"
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   },
   {
    "sigla": "IESC I",
    "nome": "Integração Ensino-Serviço e Comunidade I",
    "exame_especial": true,
    "dimensoes": [
     {
      "tipo": "cognitiva",
      "itens": [
       {
        "nome": "Prova N1",
        "pontos": 20
       },
       {
        "nome": "TPI",
        "pontos": 30,
        "descricao": "Teste de Progresso Institucional"
       },
       {
        "nome": "Prova N2",
        "pontos": 35
       },
       {
        "nome": "Prova N3",
        "pontos": 15
       }
      ]
     },
     {
      "tipo": "habilidades",
      "itens": [
       {
        "nome": "Mostra Científica Interdisciplinar",
        "pontos": 30,
        "subitens": [
         {
          "nome": "Resumo do relato de experiência",
          "pontos": 15
         },
         {
          "nome": "Habilidade de comunicação na apresentação",
          "pontos": 15
         }
        ]
       },
       {
        "nome": "Avaliação Diária",
        "pontos": 30,
        "descricao": "Rubrica por competências"
       },
       {
        "nome": "Diário de Campo Reflexivo",
        "pontos": 25,
        "descricao": "Acompanhamento semanal"
       },
       {
        "nome": "e-portfólio Dreamshaper",
        "pontos": 10,
        "descricao": "Relatório final do módulo"
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   },
   {
    "sigla": "MCM I",
    "nome": "Métodos Científicos em Medicina I",
    "exame_especial": true,
    "dimensoes": [
     {
      "tipo": "cognitiva",
      "itens": [
       {
        "nome": "Prova N1",
        "pontos": 20
       },
       {
        "nome": "TPI",
        "pontos": 30,
        "descricao": "Teste de Progresso Institucional"
       },
       {
        "nome": "Prova N2",
        "pontos": 35
       },
       {
        "nome": "Prova N3",
        "pontos": 15
       }
      ]
     },
     {
      "tipo": "habilidades",
      "itens": [
       {
        "nome": "Avaliação Individual por Ciclos",
        "pontos": 30,
        "descricao": "Em três momentos do semestre"
       },
       {
        "nome": "Elaboração do Projeto de Extensão",
        "pontos": 20,
        "descricao": "Integrado com PIEPE"
       },
       {
        "nome": "Relato de Experiência",
        "pontos": 20,
        "descricao": "Integrado com IESC"
       },
       {
        "nome": "Podcast ou vídeo",
        "pontos": 20,
        "descricao": "Comunicação sobre pesquisas"
       },
       {
        "nome": "Apresentação do resumo das atividades de extensão",
        "pontos": 5
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   },
   {
    "sigla": "PIEPE I",
    "nome": "Práticas Interdisciplinares de Extensão, Pesquisa e Ensino I",
    "exame_especial": false,
    "dimensoes": [
     {
      "tipo": "unica",
      "itens": [
       {
        "nome": "Execução das ações/produtos",
        "pontos": 25,
        "descricao": "Avaliação individual"
       },
       {
        "nome": "Projeto de Extensão",
        "pontos": 20,
        "subitens": [
         {
          "nome": "Coletivo",
          "pontos": 10
         },
         {
          "nome": "Individual",
          "pontos": 10
         }
        ]
       },
       {
        "nome": "Trilha DreamShaper",
        "pontos": 15,
        "descricao": "Projeto coletivo"
       },
       {
        "nome": "Produto Científico",
        "pontos": 10,
        "descricao": "Resumo simples"
       },
       {
        "nome": "Apresentação Final",
        "pontos": 10
       },
       {
        "nome": "Avaliação do Orientador",
        "pontos": 10,
        "descricao": "No Canvas",
        "subitens": [
         {
          "nome": "1ª etapa",
          "pontos": 5
         },
         {
          "nome": "2ª etapa",
          "pontos": 5
         }
        ]
       },
       {
        "nome": "Avaliação por Pares",
        "pontos": 5,
        "descricao": "No Canvas",
        "subitens": [
         {
          "nome": "1ª etapa",
          "pontos": 2.5
         },
         {
          "nome": "2ª etapa",
          "pontos": 2.5
         }
        ]
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   }
  ]
 },
 {
  "periodo": 2,
  "semestre": "2026.2",
  "fonte": "Regulamento do sistema de avaliação 2026.2",
  "observacao": "Composição divulgada aos alunos no regulamento do sistema de avaliação 2026.2 (unidade Ipatinga). Frequência mínima de 75% em todos os eixos.",
  "eixos": [
   {
    "sigla": "SOI II",
    "nome": "Sistemas Orgânicos Integrados II",
    "exame_especial": true,
    "dimensoes": [
     {
      "tipo": "cognitiva",
      "itens": [
       {
        "nome": "Prova N1",
        "pontos": 20
       },
       {
        "nome": "TPI",
        "pontos": 30,
        "descricao": "Teste de Progresso Institucional"
       },
       {
        "nome": "Prova N2",
        "pontos": 35
       },
       {
        "nome": "Prova N3",
        "pontos": 15
       }
      ]
     },
     {
      "tipo": "habilidades",
      "itens": [
       {
        "nome": "Avaliação Diária na APG",
        "pontos": 35,
        "subitens": [
         {
          "nome": "1ª parcial",
          "pontos": 20
         },
         {
          "nome": "2ª parcial",
          "pontos": 15
         }
        ]
       },
       {
        "nome": "Avaliações em Multiestações",
        "pontos": 30,
        "subitens": [
         {
          "nome": "1ª multiestação",
          "pontos": 15
         },
         {
          "nome": "2ª multiestação",
          "pontos": 15
         }
        ]
       },
       {
        "nome": "Avaliação Diária nos Laboratórios",
        "pontos": 30,
        "descricao": "Avaliações práticas contínuas",
        "subitens": [
         {
          "nome": "Laboratório 1",
          "pontos": 10
         },
         {
          "nome": "Laboratório 2",
          "pontos": 10
         },
         {
          "nome": "Laboratório 3",
          "pontos": 10
         }
        ]
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   },
   {
    "sigla": "HAM II",
    "nome": "Habilidades e Atitudes Médicas II",
    "exame_especial": true,
    "dimensoes": [
     {
      "tipo": "cognitiva",
      "itens": [
       {
        "nome": "Prova N1",
        "pontos": 20
       },
       {
        "nome": "TPI",
        "pontos": 30,
        "descricao": "Teste de Progresso Institucional"
       },
       {
        "nome": "Prova N2",
        "pontos": 35
       },
       {
        "nome": "Prova N3",
        "pontos": 15
       }
      ]
     },
     {
      "tipo": "habilidades",
      "itens": [
       {
        "nome": "OSCE",
        "pontos": 55,
        "descricao": "Avaliação prática padronizada"
       },
       {
        "nome": "Avaliação Diária",
        "pontos": 40,
        "subitens": [
         {
          "nome": "Conhecimento aplicado",
          "pontos": 20,
          "descricao": "Fóruns, vídeos, OSCE virtual ou de baixa aposta"
         },
         {
          "nome": "Rubrica semanal de habilidades e atitudes",
          "pontos": 20
         }
        ]
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   },
   {
    "sigla": "IESC II",
    "nome": "Integração Ensino-Serviço e Comunidade II",
    "exame_especial": true,
    "dimensoes": [
     {
      "tipo": "cognitiva",
      "itens": [
       {
        "nome": "Prova N1",
        "pontos": 20
       },
       {
        "nome": "TPI",
        "pontos": 30,
        "descricao": "Teste de Progresso Institucional"
       },
       {
        "nome": "Prova N2",
        "pontos": 35
       },
       {
        "nome": "Prova N3",
        "pontos": 15
       }
      ]
     },
     {
      "tipo": "habilidades",
      "itens": [
       {
        "nome": "Mostra Científica Interdisciplinar",
        "pontos": 30,
        "subitens": [
         {
          "nome": "Resumo do relato de experiência",
          "pontos": 15
         },
         {
          "nome": "Habilidade de comunicação na apresentação",
          "pontos": 15
         }
        ]
       },
       {
        "nome": "Avaliação Diária",
        "pontos": 30,
        "descricao": "Rubrica por competências"
       },
       {
        "nome": "Diário de Campo Reflexivo",
        "pontos": 25,
        "descricao": "Acompanhamento semanal"
       },
       {
        "nome": "e-portfólio Dreamshaper",
        "pontos": 10,
        "descricao": "Relatório final do módulo"
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   },
   {
    "sigla": "MCM II",
    "nome": "Métodos Científicos em Medicina II",
    "exame_especial": true,
    "dimensoes": [
     {
      "tipo": "cognitiva",
      "itens": [
       {
        "nome": "Prova N1",
        "pontos": 20
       },
       {
        "nome": "TPI",
        "pontos": 30,
        "descricao": "Teste de Progresso Institucional"
       },
       {
        "nome": "Prova N2",
        "pontos": 35
       },
       {
        "nome": "Prova N3",
        "pontos": 15
       }
      ]
     },
     {
      "tipo": "habilidades",
      "itens": [
       {
        "nome": "Resumo da Pesquisa",
        "pontos": 30,
        "descricao": "Apresentado na semana 19, elaborado com o IESC"
       },
       {
        "nome": "Avaliação Individual por Ciclos",
        "pontos": 30,
        "descricao": "Em três momentos do semestre"
       },
       {
        "nome": "Leitura e discussão de artigos em aula",
        "pontos": 20
       },
       {
        "nome": "Podcast ou vídeo",
        "pontos": 15,
        "descricao": "Sobre os tipos de pesquisa do semestre"
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   },
   {
    "sigla": "PIEPE II",
    "nome": "Práticas Interdisciplinares de Extensão, Pesquisa e Ensino II",
    "exame_especial": false,
    "dimensoes": [
     {
      "tipo": "unica",
      "itens": [
       {
        "nome": "Execução das ações/produtos",
        "pontos": 25,
        "descricao": "Avaliação individual"
       },
       {
        "nome": "Projeto de Extensão",
        "pontos": 20,
        "subitens": [
         {
          "nome": "Construção individual",
          "pontos": 10
         },
         {
          "nome": "Banca da construção coletiva",
          "pontos": 10
         }
        ]
       },
       {
        "nome": "Trilha DreamShaper",
        "pontos": 15,
        "descricao": "Projeto único do grupo, com participação individual"
       },
       {
        "nome": "Produto Científico",
        "pontos": 10,
        "descricao": "Resumo expandido"
       },
       {
        "nome": "Apresentação Final",
        "pontos": 10
       },
       {
        "nome": "Avaliação do Orientador",
        "pontos": 10,
        "descricao": "No Canvas",
        "subitens": [
         {
          "nome": "1ª etapa",
          "pontos": 5
         },
         {
          "nome": "2ª etapa",
          "pontos": 5
         }
        ]
       },
       {
        "nome": "Avaliação por Pares",
        "pontos": 5,
        "descricao": "No Canvas",
        "subitens": [
         {
          "nome": "1ª etapa",
          "pontos": 2.5
         },
         {
          "nome": "2ª etapa",
          "pontos": 2.5
         }
        ]
       },
       {
        "nome": "Memorial Acadêmico",
        "pontos": 5,
        "descricao": "Dois encontros individuais com o professor",
        "subitens": [
         {
          "nome": "1º encontro",
          "pontos": 2.5
         },
         {
          "nome": "2º encontro",
          "pontos": 2.5
         }
        ]
       }
      ]
     }
    ]
   }
  ]
 }
]
$regs$::jsonb;
  v_r      JSONB;
  v_e      JSONB;
  v_d      JSONB;
  v_i      JSONB;
  v_s      JSONB;
  v_eo     INT;
  v_do     INT;
  v_io     INT;
  v_so     INT;
  v_reg_id UUID;
  v_eixo   UUID;
  v_dim    UUID;
  v_item   UUID;
BEGIN
  FOR v_r IN SELECT value FROM jsonb_array_elements(v_regs) LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notas_regulamento
       WHERE periodo = (v_r->>'periodo')::smallint AND semestre = v_r->>'semestre'
    );
    -- Publicado só se o período ainda não tiver outro no ar.
    INSERT INTO public.notas_regulamento (periodo, semestre, fonte, observacao, status, publicado_em)
    VALUES (
      (v_r->>'periodo')::smallint, v_r->>'semestre', v_r->>'fonte', v_r->>'observacao',
      CASE WHEN EXISTS (SELECT 1 FROM public.notas_regulamento
                         WHERE periodo = (v_r->>'periodo')::smallint AND status = 'publicado')
           THEN 'rascunho' ELSE 'publicado' END,
      now()
    ) RETURNING id INTO v_reg_id;

    FOR v_e, v_eo IN SELECT value, ordinality FROM jsonb_array_elements(v_r->'eixos') WITH ORDINALITY LOOP
      INSERT INTO public.notas_eixo (regulamento_id, sigla, nome, exame_especial, ordem)
      VALUES (v_reg_id, v_e->>'sigla', v_e->>'nome', COALESCE((v_e->>'exame_especial')::boolean, false), v_eo)
      RETURNING id INTO v_eixo;

      FOR v_d, v_do IN SELECT value, ordinality FROM jsonb_array_elements(v_e->'dimensoes') WITH ORDINALITY LOOP
        INSERT INTO public.notas_dimensao (eixo_id, tipo, nome, ordem)
        VALUES (v_eixo, v_d->>'tipo', CASE v_d->>'tipo'
                  WHEN 'cognitiva' THEN 'Dimensão Cognitiva'
                  WHEN 'habilidades' THEN 'Habilidades e Atitudes'
                  ELSE 'Conhecimentos, Habilidades e Atitudes' END, v_do)
        RETURNING id INTO v_dim;

        FOR v_i, v_io IN SELECT value, ordinality FROM jsonb_array_elements(v_d->'itens') WITH ORDINALITY LOOP
          INSERT INTO public.notas_item (dimensao_id, nome, pontos, descricao, ordem)
          VALUES (v_dim, v_i->>'nome', (v_i->>'pontos')::numeric, v_i->>'descricao', v_io)
          RETURNING id INTO v_item;

          FOR v_s, v_so IN SELECT value, ordinality FROM jsonb_array_elements(COALESCE(v_i->'subitens', '[]'::jsonb)) WITH ORDINALITY LOOP
            INSERT INTO public.notas_item (dimensao_id, pai_id, nome, pontos, descricao, ordem)
            VALUES (v_dim, v_item, v_s->>'nome', (v_s->>'pontos')::numeric, v_s->>'descricao', v_so);
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END
$do$;
