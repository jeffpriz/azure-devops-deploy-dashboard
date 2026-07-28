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
  showingConfig = signal(true);

  onConfigSubmit(cfg: PipelineConfig): void {
    this.config.set(cfg);
    this.showingConfig.set(false);
  }

  onReconfigure(): void {
    this.showingConfig.set(true);
  }

  onPipelineChange(pipelineId: number): void {
    const current = this.config();
    if (!current || current.pipelineId === pipelineId) return;
    this.config.set({ ...current, pipelineId });
  }
}
