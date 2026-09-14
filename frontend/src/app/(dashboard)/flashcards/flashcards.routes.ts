import { Routes } from '@angular/router';

export const flashcardsRoutes: Routes = [
  {
    path: '',
    title: 'Flashcards',
    loadComponent: () =>
      import('./home/flashcards-home.component').then((m) => m.FlashcardsHomeComponent),
  },
  {
    path: 'novo',
    title: 'Novo deck de flashcards',
    loadComponent: () =>
      import('./deck-editor/deck-editor.component').then((m) => m.DeckEditorComponent),
  },
  {
    path: ':deckId/editar',
    title: 'Editar deck de flashcards',
    loadComponent: () =>
      import('./deck-editor/deck-editor.component').then((m) => m.DeckEditorComponent),
  },
  {
    path: ':deckId/estudar',
    title: 'Estudar flashcards',
    loadComponent: () =>
      import('./deck-execucao/deck-execucao.component').then((m) => m.DeckExecucaoComponent),
  },
];
