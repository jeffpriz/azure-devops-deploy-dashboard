import { Component, signal } from '@angular/core';
import { PipelineConfig } from './models/azure-devops.models';
import { ConfigFormComponent } from './components/config-form/config-form.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ConfigFormComponent, DashboardComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  config = signal<PipelineConfig | null>(null);

  onConfigSubmit(cfg: PipelineConfig): void {
    this.config.set(cfg);
  }

  onReconfigure(): void {
    this.config.set(null);
  }
}
