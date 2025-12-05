import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/document-analyzer/document-analyzer.component')
      .then(m => m.DocumentAnalyzerComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
