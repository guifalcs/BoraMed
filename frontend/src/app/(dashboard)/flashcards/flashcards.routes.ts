import { Routes } from '@angular/router';

export const flashcardsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./home/flashcards-home.component').then((m) => m.FlashcardsHomeComponent),
  },
  {
    path: 'novo',
    loadComponent: () =>
      import('./deck-editor/deck-editor.component').then((m) => m.DeckEditorComponent),
  },
  {
    path: ':deckId/editar',
    loadComponent: () =>
      import('./deck-editor/deck-editor.component').then((m) => m.DeckEditorComponent),
  },
  {
    path: ':deckId/estudar',
    loadComponent: () =>
      import('./deck-execucao/deck-execucao.component').then((m) => m.DeckExecucaoComponent),
  },
];
