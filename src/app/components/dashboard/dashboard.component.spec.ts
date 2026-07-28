import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { AzureDevOpsService } from '../../services/azure-devops.service';
import { PipelineConfig } from '../../models/azure-devops.models';

describe('DashboardComponent', () => {
  const config: PipelineConfig = {
    organizationUrl: 'https://dev.azure.com/myorg',
    projectName: 'MyProject',
    pipelineId: 1,
    pat: 'test-pat',
  };

  const adoService = {
    loadDashboard: vi.fn(() => of([])),
    listPipelines: vi.fn(() =>
      of([
        { id: 1, name: 'Deploy API' },
        { id: 2, name: 'Deploy Web' },
      ])
    ),
  };

  beforeEach(async () => {
    adoService.loadDashboard.mockClear();
    adoService.listPipelines.mockClear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [{ provide: AzureDevOpsService, useValue: adoService }],
    }).compileComponents();
  });

  it('should emit a pipeline change when a different pipeline is selected', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const emitSpy = vi.spyOn(component.pipelineChange, 'emit');
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(2);

    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(emitSpy).toHaveBeenCalledWith(2);
  });
});
