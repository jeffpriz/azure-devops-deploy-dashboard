import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { AzureDevOpsService } from '../../services/azure-devops.service';
import {
  DeploymentStageInfo,
  PipelineConfig,
} from '../../models/azure-devops.models';

describe('DashboardComponent', () => {
  const config: PipelineConfig = {
    organizationUrl: 'https://dev.azure.com/myorg',
    projectName: 'MyProject',
    pipelineId: 1,
    pat: 'test-pat',
  };

  const adoService = {
    loadDashboard: vi.fn(() => of([] as DeploymentStageInfo[])),
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

  it('should wait for a pipeline selection before loading dashboard data', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', { ...config, pipelineId: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe('');
    expect(select.options[0]?.textContent?.trim()).toBe('Choose a pipeline');
    expect(adoService.loadDashboard).not.toHaveBeenCalled();

    const component = fixture.componentInstance;
    const emitSpy = vi.spyOn(component.pipelineChange, 'emit');
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(emitSpy).toHaveBeenCalledWith(2);
  });

  it('should ignore invalid or unchanged pipeline selections', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const emitSpy = vi.spyOn(component.pipelineChange, 'emit');

    component.onPipelineSelected({ target: { value: '0' } } as unknown as Event);
    component.onPipelineSelected({ target: { value: '-4' } } as unknown as Event);
    component.onPipelineSelected({ target: { value: 'abc' } } as unknown as Event);
    component.onPipelineSelected({ target: { value: '1' } } as unknown as Event);

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should render Build pipeline and Build # as links when a build URL is present', async () => {
    adoService.loadDashboard.mockReturnValueOnce(
      of([
        {
          stageName: 'Production',
          stageIdentifier: 'production',
          runId: 1001,
          runName: 'Deploy-1001',
          runState: 'completed',
          runResult: 'succeeded',
          runUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=1001',
          startTime: '2026-07-01T00:01:00Z',
          finishTime: '2026-07-01T00:08:00Z',
          buildPipelineName: 'Build Pipeline',
          buildRunId: 2001,
          buildUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=2001',
          buildNumber: '2026.07.03.1',
          commitId: null,
          commitShort: null,
          sourceBranch: null,
          repositoryName: null,
          requestedFor: null,
        },
      ])
    );

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('.build-link') as NodeListOf<HTMLAnchorElement>;
    expect(links.length).toBe(2);
    expect(links[0]?.textContent?.trim()).toBe('Build Pipeline');
    expect(links[0]?.getAttribute('href')).toBe(
      'https://dev.azure.com/myorg/MyProject/_build/results?buildId=2001'
    );
    expect(links[1]?.textContent?.trim()).toBe('2026.07.03.1');
    expect(links[1]?.getAttribute('href')).toBe(
      'https://dev.azure.com/myorg/MyProject/_build/results?buildId=2001'
    );
  });
});
