import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import { pipeline } from 'npm:@supabase/middleware@1'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@^4.3.6'
import type { Database } from './database.types.ts'

const ALLOWED_EMAIL = 'arthurcoelho3524@gmail.com'
const QUESTION_FORMATS = ['multipla_escolha', 'resposta_aberta_curta', 'verdadeiro_falso', 'associacao'] as const
const QUESTION_TYPES = ['nacional', 'processual', 'laboratorio'] as const
const PROOF_FORMATS = ['nacional', 'processual', 'laboratorio', 'multiestacoes'] as const

type Db = ReturnType<typeof createClient<Database>>
type Entity = 'questao' | 'prova' | 'material' | 'flashcard_deck'

function result(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function fail(message: string): never {
  throw new Error(message)
}

async function owned(db: Db, entity: Entity, id: string, ownerId: string): Promise<void> {
  const { data, error } = await db.from('mcp_created_content')
    .select('entity_id').eq('entity_type', entity).eq('entity_id', id).eq('owner_id', ownerId).maybeSingle()
  if (error) fail(`Falha ao validar autoria: ${error.message}`)
  if (!data) fail('Este registro não foi criado por este usuário via MCP; alteração recusada.')
}

async function markOwned(db: Db, entity: Entity, id: string, ownerId: string): Promise<void> {
  const { error } = await db.from('mcp_created_content').insert({ entity_type: entity, entity_id: id, owner_id: ownerId })
  if (error) fail(`Registro criado, mas não foi possível gravar a autoria MCP: ${error.message}`)
}

async function deleteOwned(db: Db, entity: Entity, id: string, ownerId: string): Promise<void> {
  const { error } = await db.from('mcp_created_content').delete()
    .eq('entity_type', entity).eq('entity_id', id).eq('owner_id', ownerId)
  if (error) fail(`Falha ao remover autoria MCP: ${error.message}`)
}

Deno.serve(pipeline(
  [withOAuthProtectedResource(), withSupabase<Database>({ auth: 'user' })],
  async (req, { supabase }) => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const user = authData.user
    if (authError || !user || user.email?.toLowerCase() !== ALLOWED_EMAIL) {
      return Response.json({ error: 'Acesso restrito à conta autorizada.' }, { status: 403 })
    }

    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('papel, banido').eq('id', user.id).maybeSingle()
    if (profileError || !profile || profile.banido || typeof profile.papel !== 'string' || !['admin', 'super_admin'].includes(profile.papel)) {
      return Response.json({ error: 'A conta autorizada precisa estar ativa e ter papel de admin.' }, { status: 403 })
    }

    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) return Response.json({ error: 'Configuração interna incompleta.' }, { status: 500 })
    const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const userDb = supabase as Db
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'BoraMed Conteúdo', version: '1.0.0' })

      server.registerTool('boramed_quickstart', {
        description: 'Lista os tipos de conteúdo e os limites de autoria do BoraMed MCP.',
        inputSchema: z.object({}), annotations: { readOnlyHint: true },
      }, async () => result({
        acesso: 'leitura do acervo de conteúdo da plataforma; escrita e remoção apenas em registros criados pelo usuário via MCP',
        ferramentas: ['buscar_questoes', 'obter_questao', 'criar_questao', 'atualizar_questao', 'excluir_questao', 'listar_provas', 'obter_prova', 'criar_prova', 'atualizar_prova', 'excluir_prova', 'listar_materiais', 'obter_material_pdf', 'criar_material_pdf', 'atualizar_material', 'excluir_material', 'listar_flashcards', 'criar_deck_flashcards', 'atualizar_deck_flashcards', 'excluir_deck_flashcards', 'listar_taxonomia'],
      }))

      server.registerTool('buscar_questoes', {
        description: 'Busca questões do acervo inteiro por texto, disciplina ou tipo. A leitura inclui alternativas e gabarito para uso editorial.',
        inputSchema: z.object({ termo: z.string().max(200).optional(), tipo: z.enum(QUESTION_TYPES).optional(), disciplina_id: z.string().uuid().optional(), limite: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) }),
        annotations: { readOnlyHint: true },
      }, async ({ termo, tipo, disciplina_id, limite, offset }) => {
        let query = db.from('questao').select('id,enunciado,enunciado_apoio,formato,tipo_questao,disciplina_id,status,explicacao,referencia,fonte,imagem_url,autor_id,criado_em,atualizado_em', { count: 'exact' }).order('criado_em', { ascending: false }).range(offset, offset + limite - 1)
        if (tipo) query = query.eq('tipo_questao', tipo)
        if (disciplina_id) query = query.eq('disciplina_id', disciplina_id)
        if (termo) query = query.ilike('enunciado', `%${termo.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)
        const { data, error, count } = await query
        if (error) fail(error.message)
        return result({ total: count, questoes: data })
      })

      server.registerTool('obter_questao', {
        description: 'Lê uma questão existente, incluindo alternativas e temas.',
        inputSchema: z.object({ id: z.string().uuid() }), annotations: { readOnlyHint: true },
      }, async ({ id }) => {
        const [{ data: question, error }, { data: alternatives, error: altError }, { data: topics, error: topicsError }] = await Promise.all([
          db.from('questao').select('*').eq('id', id).maybeSingle(),
          db.from('alternativa').select('*').eq('questao_id', id).order('ordem'),
          db.from('questao_tema').select('tema_id,principal').eq('questao_id', id),
        ])
        if (error || altError || topicsError) fail(error?.message ?? altError?.message ?? topicsError?.message ?? 'Falha ao ler questão')
        if (!question) fail('Questão não encontrada.')
        return result({ ...question, alternativas: alternatives, temas: topics })
      })

      const questionFields = z.object({
        enunciado: z.string().min(1).max(30000), enunciado_apoio: z.string().max(30000).nullable().optional(),
        formato: z.enum(QUESTION_FORMATS), tipo_questao: z.enum(QUESTION_TYPES), status: z.enum(['rascunho', 'ativa', 'em_revisao', 'publicada', 'arquivada']).default('rascunho'),
        disciplina_id: z.string().uuid().nullable().optional(), imagem_url: z.string().url().nullable().optional(), imagem_legenda: z.string().max(1000).nullable().optional(),
        explicacao: z.string().max(30000).nullable().optional(), referencia: z.string().max(4000).nullable().optional(), fonte: z.string().max(1000).nullable().optional(),
        resposta_correta_texto: z.string().max(5000).nullable().optional(), respostas_aceitas: z.array(z.string().max(1000)).max(50).optional(),
        resposta_modelo: z.string().max(30000).nullable().optional(), pontos_chave: z.array(z.string().max(500)).max(100).default([]), criterios_correcao: z.string().max(10000).nullable().optional(),
        nivel_bloom: z.number().int().min(1).max(6).nullable().optional(), formato_prova: z.enum(['N1', 'N2', 'teste_progresso', 'integradora']).nullable().optional(),
        alternativas: z.array(z.object({ letra: z.string().min(1).max(5), texto: z.string().min(1).max(5000), correta: z.boolean(), imagem_url: z.string().url().nullable().optional() })).max(10).default([]),
        tema_ids: z.array(z.string().uuid()).max(20).default([]),
      })

      server.registerTool('criar_questao', {
        description: 'Cria uma questão autoral com alternativas e temas opcionais; a questão fica inicialmente como rascunho.',
        inputSchema: questionFields, annotations: { destructiveHint: false },
      }, async (input) => {
        if (input.formato === 'multipla_escolha' && (input.alternativas.length < 2 || input.alternativas.filter((a) => a.correta).length !== 1)) fail('Questão de múltipla escolha precisa de ao menos duas alternativas e exatamente uma correta.')
        if (input.formato !== 'resposta_aberta_curta' && input.alternativas.length < 2) fail('Este formato exige pelo menos duas alternativas.')
        const { alternativas, tema_ids, ...fields } = input
        const { data: question, error } = await db.from('questao').insert({
          ...fields, autor_id: user.id, origem_geracao: 'manual', revisado: false, anulada: false,
          tipo_questao: fields.tipo_questao,
        }).select('id,enunciado,formato,tipo_questao,status').single()
        if (error || !question) fail(error?.message ?? 'Não foi possível criar questão.')
        const rollback = async () => { await db.from('questao').delete().eq('id', question.id) }
        if (alternativas.length) {
          const { error: altError } = await db.from('alternativa').insert(alternativas.map((a, i) => ({ ...a, questao_id: question.id, ordem: i })))
          if (altError) { await rollback(); fail(altError.message) }
        }
        if (tema_ids.length) {
          const { error: themeError } = await db.from('questao_tema').insert(tema_ids.map((tema_id, i) => ({ questao_id: question.id, tema_id, principal: i === 0 })))
          if (themeError) { await rollback(); fail(themeError.message) }
        }
        await markOwned(db, 'questao', question.id, user.id)
        return result(question)
      })

      server.registerTool('atualizar_questao', {
        description: 'Atualiza questão criada por este usuário via MCP. Se alternativas ou temas forem informados, substitui as listas existentes.',
        inputSchema: z.object({ id: z.string().uuid(), alteracoes: questionFields.partial() }),
      }, async ({ id, alteracoes }) => {
        await owned(db, 'questao', id, user.id)
        const { alternativas, tema_ids, ...fields } = alteracoes
        if (Object.keys(fields).length) {
          const { error } = await db.from('questao').update({ ...fields, atualizado_em: new Date().toISOString() }).eq('id', id)
          if (error) fail(error.message)
        }
        if (alternativas) {
          if (alteracoes.formato === 'multipla_escolha' && (alternativas.length < 2 || alternativas.filter((a) => a.correta).length !== 1)) fail('Múltipla escolha precisa de exatamente uma alternativa correta.')
          const { error } = await db.from('alternativa').delete().eq('questao_id', id)
          if (error) fail(error.message)
          if (alternativas.length) {
            const { error: insertError } = await db.from('alternativa').insert(alternativas.map((a, i) => ({ ...a, questao_id: id, ordem: i })))
            if (insertError) fail(insertError.message)
          }
        }
        if (tema_ids) {
          const { error } = await db.from('questao_tema').delete().eq('questao_id', id)
          if (error) fail(error.message)
          if (tema_ids.length) {
            const { error: insertError } = await db.from('questao_tema').insert(tema_ids.map((tema_id, i) => ({ questao_id: id, tema_id, principal: i === 0 })))
            if (insertError) fail(insertError.message)
          }
        }
        return result({ id, atualizado: true })
      })

      server.registerTool('excluir_questao', {
        description: 'Exclui questão criada por este usuário via MCP.',
        inputSchema: z.object({ id: z.string().uuid() }), annotations: { destructiveHint: true },
      }, async ({ id }) => {
        await owned(db, 'questao', id, user.id)
        const { error } = await db.from('questao').delete().eq('id', id)
        if (error) fail(error.message)
        await deleteOwned(db, 'questao', id, user.id)
        return result({ id, excluida: true })
      })

      server.registerTool('listar_provas', {
        description: 'Lista provas autorais e provas do acervo para consulta editorial.',
        inputSchema: z.object({ termo: z.string().max(200).optional(), formato: z.enum(PROOF_FORMATS).optional(), limite: z.number().int().min(1).max(100).default(30), offset: z.number().int().min(0).default(0) }), annotations: { readOnlyHint: true },
      }, async ({ termo, formato, limite, offset }) => {
        let query = db.from('prova').select('id,nome,tipo,origem,formato,subtipo,subtipo_nacional,periodo,qtd_questoes,publicada,arquivada,criado_por,criado_em', { count: 'exact' }).order('criado_em', { ascending: false }).range(offset, offset + limite - 1)
        if (formato) query = query.eq('formato', formato)
        if (termo) query = query.ilike('nome', `%${termo.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)
        const { data, error, count } = await query
        if (error) fail(error.message)
        return result({ total: count, provas: data })
      })

      server.registerTool('obter_prova', {
        description: 'Lê uma prova existente com seus metadados e questões na ordem da prova, incluindo alternativas e temas.',
        inputSchema: z.object({ id: z.string().uuid() }), annotations: { readOnlyHint: true },
      }, async ({ id }) => {
        const [{ data: proof, error }, { data: links, error: linksError }] = await Promise.all([
          db.from('prova').select('*').eq('id', id).maybeSingle(),
          db.from('prova_questao').select('questao_id,ordem').eq('prova_id', id).order('ordem'),
        ])
        if (error || linksError) fail(error?.message ?? linksError?.message ?? 'Falha ao ler prova')
        if (!proof) fail('Prova não encontrada.')
        const questionIds = (links ?? []).map((link) => String(link.questao_id))
        if (questionIds.length === 0) return result({ ...proof, questoes: [] })
        const [{ data: questions, error: questionsError }, { data: alternatives, error: alternativesError }, { data: topics, error: topicsError }] = await Promise.all([
          db.from('questao').select('*').in('id', questionIds),
          db.from('alternativa').select('*').in('questao_id', questionIds).order('ordem'),
          db.from('questao_tema').select('questao_id,tema_id,principal').in('questao_id', questionIds),
        ])
        if (questionsError || alternativesError || topicsError) fail(questionsError?.message ?? alternativesError?.message ?? topicsError?.message ?? 'Falha ao ler questões da prova')
        const questionRows = (questions ?? []) as Array<Record<string, unknown>>
        const alternativeRows = (alternatives ?? []) as Array<Record<string, unknown>>
        const topicRows = (topics ?? []) as Array<Record<string, unknown>>
        const byId = new Map(questionRows.map((question) => [String(question['id']), question]))
        return result({
          ...proof,
          questoes: (links ?? []).map((link) => {
            const question = byId.get(String(link.questao_id))
            return {
              ordem: link.ordem,
              questao: question ? {
                ...question,
                alternativas: alternativeRows.filter((item) => item['questao_id'] === question['id']),
                temas: topicRows.filter((item) => item['questao_id'] === question['id']).map((item) => ({ tema_id: item['tema_id'], principal: item['principal'] })),
              } : null,
            }
          }),
        })
      })

      server.registerTool('criar_prova', {
        description: 'Cria uma prova autoral e vincula questões existentes na ordem informada.',
        inputSchema: z.object({ nome: z.string().min(3).max(250), formato: z.enum(PROOF_FORMATS), disciplina_id: z.string().uuid().nullable().optional(), periodo: z.number().int().min(1).max(20).nullable().optional(), subtipo: z.string().max(80).nullable().optional(), subtipo_nacional: z.enum(['N1', 'N2', 'teste_progresso', 'integradora']).nullable().optional(), questao_ids: z.array(z.string().uuid()).min(1).max(200), publicar: z.boolean().default(false) }),
      }, async ({ nome, formato, disciplina_id, periodo, subtipo, subtipo_nacional, questao_ids, publicar }) => {
        if (new Set(questao_ids).size !== questao_ids.length) fail('A prova não pode conter a mesma questão mais de uma vez.')
        const isTP = (subtipo ?? subtipo_nacional) === 'teste_progresso'
        if (isTP === (periodo != null)) fail('Período deve ser nulo para teste de progresso e preenchido nos demais subtipos.')
        const { data: proof, error } = await db.from('prova').insert({
          nome, tipo: 'autoral', origem: 'autoral', formato, disciplina_id: disciplina_id ?? null,
          periodo: periodo ?? null, subtipo: subtipo ?? null, subtipo_nacional: subtipo_nacional ?? null,
          qtd_questoes: questao_ids.length, publicada: publicar, arquivada: false, criado_por: user.id,
        }).select('id,nome,formato,qtd_questoes,publicada').single()
        if (error || !proof) fail(error?.message ?? 'Não foi possível criar a prova.')
        const { error: linkError } = await db.from('prova_questao').insert(questao_ids.map((questao_id, ordem) => ({ prova_id: proof.id, questao_id, ordem: ordem + 1 })))
        if (linkError) { await db.from('prova').delete().eq('id', proof.id); fail(linkError.message) }
        await markOwned(db, 'prova', proof.id, user.id)
        return result(proof)
      })

      server.registerTool('atualizar_prova', {
        description: 'Atualiza metadados e composição de prova criada por este usuário via MCP.',
        inputSchema: z.object({ id: z.string().uuid(), alteracoes: z.object({ nome: z.string().min(3).max(250).optional(), publicada: z.boolean().optional(), arquivada: z.boolean().optional(), questao_ids: z.array(z.string().uuid()).min(1).max(200).optional() }) }),
      }, async ({ id, alteracoes }) => {
        await owned(db, 'prova', id, user.id)
        const { questao_ids, ...fields } = alteracoes
        if (Object.keys(fields).length) {
          const { error } = await db.from('prova').update({ ...fields, atualizado_em: new Date().toISOString() }).eq('id', id)
          if (error) fail(error.message)
        }
        if (questao_ids) {
          if (new Set(questao_ids).size !== questao_ids.length) fail('A prova não pode conter questões repetidas.')
          const { error: deleteError } = await db.from('prova_questao').delete().eq('prova_id', id)
          if (deleteError) fail(deleteError.message)
          const { error: insertError } = await db.from('prova_questao').insert(questao_ids.map((questao_id, ordem) => ({ prova_id: id, questao_id, ordem: ordem + 1 })))
          if (insertError) fail(insertError.message)
          const { error: countError } = await db.from('prova').update({ qtd_questoes: questao_ids.length }).eq('id', id)
          if (countError) fail(countError.message)
        }
        return result({ id, atualizado: true })
      })

      server.registerTool('excluir_prova', {
        description: 'Exclui uma prova criada por este usuário via MCP sem excluir as questões vinculadas.',
        inputSchema: z.object({ id: z.string().uuid() }), annotations: { destructiveHint: true },
      }, async ({ id }) => {
        await owned(db, 'prova', id, user.id)
        const { error: linksError } = await db.from('prova_questao').delete().eq('prova_id', id)
        if (linksError) fail(linksError.message)
        const { error } = await db.from('prova').delete().eq('id', id)
        if (error) fail(error.message)
        await deleteOwned(db, 'prova', id, user.id)
        return result({ id, excluida: true })
      })

      server.registerTool('listar_materiais', {
        description: 'Lista categorias, tópicos e PDFs do acervo de materiais de estudo.',
        inputSchema: z.object({ categoria_id: z.string().uuid().optional(), termo: z.string().max(200).optional(), limite: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) }), annotations: { readOnlyHint: true },
      }, async ({ categoria_id, termo, limite, offset }) => {
        let query = db.from('material_arquivo').select('id,categoria_id,topico_id,titulo,descricao,storage_path,mime_type,tamanho_bytes,ordem,ativo,criado_em', { count: 'exact' }).order('ordem').range(offset, offset + limite - 1)
        if (categoria_id) query = query.eq('categoria_id', categoria_id)
        if (termo) query = query.ilike('titulo', `%${termo.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)
        const [{ data, error, count }, { data: categories, error: catError }, { data: topics, error: topicError }] = await Promise.all([
          query, db.from('material_categoria').select('id,slug,titulo,descricao,ordem,ativo').order('ordem'),
          db.from('material_topico').select('id,categoria_id,titulo,ordem,ativo').order('ordem'),
        ])
        if (error || catError || topicError) fail(error?.message ?? catError?.message ?? topicError?.message ?? 'Falha ao ler materiais')
        return result({ total: count, materiais: data, categorias: categories, topicos: topics })
      })

      server.registerTool('obter_material_pdf', {
        description: 'Gera um link assinado de curta duração para ler um PDF existente do acervo.',
        inputSchema: z.object({ id: z.string().uuid() }), annotations: { readOnlyHint: true },
      }, async ({ id }) => {
        const { data: file, error } = await db.from('material_arquivo').select('titulo,descricao,storage_path,mime_type,tamanho_bytes').eq('id', id).maybeSingle()
        if (error || !file || typeof file.storage_path !== 'string') fail(error?.message ?? 'Material não encontrado.')
        const { data: signed, error: signedError } = await db.storage.from('materiais').createSignedUrl(file.storage_path, 900)
        if (signedError || !signed) fail(signedError?.message ?? 'Não foi possível preparar o PDF.')
        return result({ titulo: file.titulo, descricao: file.descricao, mime_type: file.mime_type, tamanho_bytes: file.tamanho_bytes, url_temporaria: signed.signedUrl, expira_em_segundos: 900 })
      })

      server.registerTool('criar_material_pdf', {
        description: 'Envia um PDF para o bucket privado de materiais e cria o registro editorial. Aceita arquivo base64 até 12 MiB.',
        inputSchema: z.object({ categoria_id: z.string().uuid(), topico_id: z.string().uuid().nullable().optional(), titulo: z.string().min(1).max(250), descricao: z.string().max(3000).nullable().optional(), conteudo_base64: z.string().min(20).max(16_800_000), ordem: z.number().int().min(0).default(0) }),
      }, async ({ categoria_id, topico_id, titulo, descricao, conteudo_base64, ordem }) => {
        const bytes = Uint8Array.from(atob(conteudo_base64.replace(/^data:application\/pdf;base64,/, '')), (c) => c.charCodeAt(0))
        if (bytes.byteLength > 12 * 1024 * 1024 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') fail('O arquivo precisa ser um PDF válido de até 12 MiB.')
        const objectPath = `mcp/${user.id}/${crypto.randomUUID()}.pdf`
        const { error: uploadError } = await db.storage.from('materiais').upload(objectPath, bytes, { contentType: 'application/pdf', upsert: false })
        if (uploadError) fail(uploadError.message)
        const { data: material, error } = await db.from('material_arquivo').insert({ categoria_id, topico_id: topico_id ?? null, titulo, descricao: descricao ?? null, storage_path: objectPath, mime_type: 'application/pdf', tamanho_bytes: bytes.byteLength, ordem, ativo: true }).select('id,categoria_id,topico_id,titulo,descricao,storage_path,tamanho_bytes,ativo').single()
        if (error || !material) { await db.storage.from('materiais').remove([objectPath]); fail(error?.message ?? 'Não foi possível criar o material.') }
        await markOwned(db, 'material', material.id, user.id)
        return result(material)
      })

      server.registerTool('atualizar_material', {
        description: 'Atualiza metadados de material criado por este usuário via MCP.',
        inputSchema: z.object({ id: z.string().uuid(), alteracoes: z.object({ categoria_id: z.string().uuid().optional(), topico_id: z.string().uuid().nullable().optional(), titulo: z.string().min(1).max(250).optional(), descricao: z.string().max(3000).nullable().optional(), ordem: z.number().int().min(0).optional(), ativo: z.boolean().optional() }) }),
      }, async ({ id, alteracoes }) => {
        await owned(db, 'material', id, user.id)
        const { error } = await db.from('material_arquivo').update(alteracoes).eq('id', id)
        if (error) fail(error.message)
        return result({ id, atualizado: true })
      })

      server.registerTool('excluir_material', {
        description: 'Exclui um material criado por este usuário via MCP e remove seu PDF do bucket privado.',
        inputSchema: z.object({ id: z.string().uuid() }), annotations: { destructiveHint: true },
      }, async ({ id }) => {
        await owned(db, 'material', id, user.id)
        const { data: file, error: readError } = await db.from('material_arquivo').select('storage_path').eq('id', id).single()
        if (readError || !file || typeof file.storage_path !== 'string') fail(readError?.message ?? 'Material não encontrado.')
        const { error } = await db.from('material_arquivo').delete().eq('id', id)
        if (error) fail(error.message)
        await db.storage.from('materiais').remove([file.storage_path])
        await deleteOwned(db, 'material', id, user.id)
        return result({ id, excluido: true })
      })

      server.registerTool('listar_flashcards', {
        description: 'Lista todos os decks de flashcards e os cards correspondentes.',
        inputSchema: z.object({ termo: z.string().max(200).optional(), limite: z.number().int().min(1).max(100).default(30), offset: z.number().int().min(0).default(0) }), annotations: { readOnlyHint: true },
      }, async ({ termo, limite, offset }) => {
        let query = db.from('flashcard_decks').select('id,user_id,oficial,titulo,descricao,publico,cards_count,criado_em,atualizado_em', { count: 'exact' }).order('criado_em', { ascending: false }).range(offset, offset + limite - 1)
        if (termo) query = query.ilike('titulo', `%${termo.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)
        const { data: decks, error, count } = await query
        if (error) fail(error.message)
        const ids = (decks ?? []).map((d) => d.id)
        const { data: cards, error: cardError } = ids.length ? await db.from('flashcard_cards').select('id,deck_id,posicao,frente,verso,frente_imagem_url,verso_imagem_url').in('deck_id', ids).order('posicao') : { data: [], error: null }
        if (cardError) fail(cardError.message)
        return result({ total: count, decks: (decks ?? []).map((d) => ({ ...d, cards: (cards ?? []).filter((c) => c.deck_id === d.id) })) })
      })

      const cardsSchema = z.array(z.object({ frente: z.string().max(2000).default(''), verso: z.string().max(2000).default(''), frente_imagem_url: z.string().url().nullable().optional(), verso_imagem_url: z.string().url().nullable().optional() })).min(1).max(200)
      server.registerTool('criar_deck_flashcards', {
        description: 'Cria um deck próprio de flashcards com até 200 cards.',
        inputSchema: z.object({ titulo: z.string().min(3).max(120), descricao: z.string().max(500).nullable().optional(), publico: z.boolean().default(true), cards: cardsSchema }),
      }, async ({ titulo, descricao, publico, cards }) => {
        const { data: id, error } = await userDb.rpc('flashcards_criar_deck', { p_titulo: titulo, p_descricao: descricao ?? null, p_publico: publico, p_cards: cards })
        if (error || typeof id !== 'string') fail(error?.message ?? 'Não foi possível criar deck.')
        await markOwned(db, 'flashcard_deck', id, user.id)
        return result({ id, titulo, quantidade_cards: cards.length })
      })

      server.registerTool('atualizar_deck_flashcards', {
        description: 'Atualiza um deck e sua lista completa de cards, somente se criado por este usuário via MCP.',
        inputSchema: z.object({ id: z.string().uuid(), titulo: z.string().min(3).max(120), descricao: z.string().max(500).nullable().optional(), publico: z.boolean().default(true), cards: cardsSchema }),
      }, async ({ id, titulo, descricao, publico, cards }) => {
        await owned(db, 'flashcard_deck', id, user.id)
        const { error } = await userDb.rpc('flashcards_atualizar_deck', { p_deck_id: id, p_titulo: titulo, p_descricao: descricao ?? null, p_publico: publico, p_cards: cards })
        if (error) fail(error.message)
        return result({ id, atualizado: true, quantidade_cards: cards.length })
      })

      server.registerTool('excluir_deck_flashcards', {
        description: 'Exclui um deck criado por este usuário via MCP.',
        inputSchema: z.object({ id: z.string().uuid() }), annotations: { destructiveHint: true },
      }, async ({ id }) => {
        await owned(db, 'flashcard_deck', id, user.id)
        const { error } = await db.from('flashcard_decks').delete().eq('id', id)
        if (error) fail(error.message)
        await deleteOwned(db, 'flashcard_deck', id, user.id)
        return result({ id, excluido: true })
      })

      server.registerTool('listar_taxonomia', {
        description: 'Lista disciplinas, temas e categorias necessárias para criar questões e materiais.',
        inputSchema: z.object({}), annotations: { readOnlyHint: true },
      }, async () => {
        const [{ data: disciplines, error: dError }, { data: themes, error: tError }, { data: categories, error: cError }, { data: topics, error: pError }] = await Promise.all([
          db.from('disciplina').select('id,nome,periodo').order('periodo').order('nome'),
          db.from('tema').select('id,nome,disciplina_id').order('nome'),
          db.from('material_categoria').select('id,slug,titulo,descricao,ordem,ativo').order('ordem'),
          db.from('material_topico').select('id,categoria_id,titulo,ordem,ativo').order('ordem'),
        ])
        if (dError || tError || cError || pError) fail(dError?.message ?? tError?.message ?? cError?.message ?? pError?.message ?? 'Falha ao ler taxonomia')
        return result({ disciplinas: disciplines, temas: themes, categorias_materiais: categories, topicos_materiais: topics })
      })

      return server
    })
    return handler.fetch(req)
  },
))
