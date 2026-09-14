import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    title: 'Admin · Dashboard',
    loadComponent: () =>
      import('./dashboard/admin-dashboard.component').then(
        (m) => m.AdminDashboardComponent,
      ),
  },
  {
    path: 'usuarios',
    title: 'Admin · Usuários',
    loadComponent: () =>
      import('./usuarios/admin-usuarios.component').then(
        (m) => m.AdminUsuariosComponent,
      ),
  },
  {
    path: 'usuarios/metricas',
    title: 'Admin · Métricas de usuários',
    loadComponent: () =>
      import('./usuarios/metricas/admin-usuario-metricas.component').then(
        (m) => m.AdminUsuarioMetricasComponent,
      ),
  },
  {
    path: 'usuarios/:id/metricas',
    title: 'Admin · Métricas do usuário',
    loadComponent: () =>
      import('./usuarios/metricas/admin-usuario-metricas.component').then(
        (m) => m.AdminUsuarioMetricasComponent,
      ),
  },
  {
    path: 'acessos',
    title: 'Admin · Acessos',
    loadComponent: () =>
      import('./acessos/admin-acessos.component').then(
        (m) => m.AdminAcessosComponent,
      ),
  },
  {
    path: 'financeiro',
    title: 'Admin · Financeiro',
    loadComponent: () =>
      import('./financeiro/admin-financeiro.component').then(
        (m) => m.AdminFinanceiroComponent,
      ),
  },
  {
    path: 'financeiro/despesas',
    title: 'Admin · Despesas',
    loadComponent: () =>
      import('./financeiro/despesas/admin-despesas.component').then(
        (m) => m.AdminDespesasComponent,
      ),
  },
  {
    path: 'cupons',
    title: 'Admin · Cupons',
    loadComponent: () =>
      import('./cupons/admin-cupons.component').then(
        (m) => m.AdminCuponsComponent,
      ),
  },
  {
    path: 'questoes',
    title: 'Admin · Questões',
    loadComponent: () =>
      import('./questoes/admin-questoes.component').then(
        (m) => m.AdminQuestoesComponent,
      ),
  },
  {
    path: 'ia',
    title: 'Admin · IA · Aurora',
    loadComponent: () =>
      import('./ia/admin-ia.component').then((m) => m.AdminIaComponent),
  },
  {
    path: 'provas',
    title: 'Admin · Provas',
    loadComponent: () =>
      import('./provas/admin-provas.component').then(
        (m) => m.AdminProvasComponent,
      ),
  },
  {
    path: 'temas',
    title: 'Admin · Temas',
    loadComponent: () =>
      import('./temas/admin-temas.component').then(
        (m) => m.AdminTemasComponent,
      ),
  },
  {
    path: 'disciplinas',
    title: 'Admin · Disciplinas',
    loadComponent: () =>
      import('./disciplinas/admin-disciplinas.component').then(
        (m) => m.AdminDisciplinasComponent,
      ),
  },
  {
    path: 'importar',
    title: 'Admin · Importar',
    loadComponent: () =>
      import('./importar/admin-importar.component').then(
        (m) => m.AdminImportarComponent,
      ),
  },
  {
    path: 'avisos',
    title: 'Admin · Avisos',
    loadComponent: () =>
      import('./avisos/admin-avisos.component').then(
        (m) => m.AdminAvisosComponent,
      ),
  },
  {
    path: 'notificacoes',
    title: 'Admin · Notificações',
    loadComponent: () =>
      import('./notificacoes/admin-notificacoes.component').then(
        (m) => m.AdminNotificacoesComponent,
      ),
  },
  {
    path: 'campanhas',
    title: 'Admin · Campanhas',
    loadComponent: () =>
      import('./campanhas/admin-campanhas.component').then(
        (m) => m.AdminCampanhasComponent,
      ),
  },
  {
    path: 'suporte',
    title: 'Admin · Suporte',
    loadComponent: () =>
      import('./suporte/admin-suporte.component').then(
        (m) => m.AdminSuporteComponent,
      ),
  },
  {
    path: 'materiais',
    title: 'Admin · Materiais',
    loadComponent: () =>
      import('./materiais/admin-materiais.component').then(
        (m) => m.AdminMateriaisComponent,
      ),
  },
  {
    path: 'flashcards',
    title: 'Admin · Flashcards',
    loadComponent: () =>
      import('./flashcards/admin-flashcards.component').then(
        (m) => m.AdminFlashcardsComponent,
      ),
  },
];
