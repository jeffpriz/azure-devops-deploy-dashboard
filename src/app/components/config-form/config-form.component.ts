import { Component, output, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PipelineConfig } from '../../models/azure-devops.models';

@Component({
  selector: 'app-config-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './config-form.component.html',
  styleUrl: './config-form.component.scss',
})
export class ConfigFormComponent {
  readonly configSubmit = output<PipelineConfig>();

  form: FormGroup;
  showPat = signal(false);

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      organizationUrl: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
      projectName: ['', Validators.required],
      pipelineId: ['', [Validators.required, Validators.min(1)]],
      pat: ['', Validators.required],
    });
  }

  togglePat(): void {
    this.showPat.set(!this.showPat());
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.configSubmit.emit({
      organizationUrl: raw.organizationUrl.trim(),
      projectName: raw.projectName.trim(),
      pipelineId: Number(raw.pipelineId),
      pat: raw.pat.trim(),
    });
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl.touched);
  }
}
