import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AzureDevOpsService } from './azure-devops.service';
import { PipelineConfig } from '../models/azure-devops.models';

describe('AzureDevOpsService', () => {
  let service: AzureDevOpsService;
  let httpMock: HttpTestingController;

  const config: PipelineConfig = {
    organizationUrl: 'https://dev.azure.com/myorg',
    projectName: 'MyProject',
    pipelineId: 42,
    pat: 'test-pat',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AzureDevOpsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AzureDevOpsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should not fail when pipeline resource is missing run metadata', async () => {
    const resultPromise = firstValueFrom(service.loadDashboard(config));

    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/pipelines/42/runs' &&
          req.params.get('api-version') === '7.1' &&
          req.params.get('$top') === '100'
      )
      .flush({
        value: [
          {
            id: 1001,
            name: 'Deploy-1001',
            state: 'completed',
            result: 'succeeded',
            createdDate: '2026-07-01T00:00:00Z',
            finishedDate: '2026-07-01T00:10:00Z',
          },
        ],
        count: 1,
      });

    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/pipelines/42/runs/1001' &&
          req.params.get('api-version') === '7.1'
      )
      .flush({
        id: 1001,
        name: 'Deploy-1001',
        state: 'completed',
        result: 'succeeded',
        createdDate: '2026-07-01T00:00:00Z',
        finishedDate: '2026-07-01T00:10:00Z',
        resources: {
          pipelines: {
            upstream: {
              pipeline: { id: 7, name: 'Build Pipeline' },
            },
          },
        },
      } as any);

    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/build/builds/1001/timeline' &&
          req.params.get('api-version') === '7.1'
      )
      .flush({
        records: [
          {
            id: 's1',
            parentId: null,
            type: 'Stage',
            name: 'Production',
            identifier: 'production',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-01T00:01:00Z',
            finishTime: '2026-07-01T00:08:00Z',
            order: 1,
          },
        ],
      });

    httpMock.expectNone((req) => /\/_apis\/build\/builds\/\d+$/.test(req.url));

    const result = await resultPromise;
    expect(result.length).toBe(1);
    expect(result[0].buildRunId).toBeNull();
    expect(result[0].buildPipelineName).toBeNull();
  });

  it('should return a descriptive error when pipeline runs cannot be loaded', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resultPromise = firstValueFrom(service.loadDashboard(config));

    httpMock
      .expectOne(
        (req) =>
          req.url ===
          'https://dev.azure.com/myorg/MyProject/_apis/pipelines/42/runs'
      )
      .flush({ message: 'not found' }, { status: 404, statusText: 'Not Found' });

    const assertion = expect(resultPromise).rejects.toThrowError(
      'Failed to load dashboard data: Failed to load pipeline runs (HTTP 404)'
    );
    await assertion;
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should continue using run summary when run detail fetch fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resultPromise = firstValueFrom(service.loadDashboard(config));

    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/pipelines/42/runs' &&
          req.params.get('api-version') === '7.1' &&
          req.params.get('$top') === '100'
      )
      .flush({
        value: [
          {
            id: 1002,
            name: 'Deploy-1002',
            state: 'completed',
            result: 'succeeded',
            createdDate: '2026-07-02T00:00:00Z',
            finishedDate: '2026-07-02T00:10:00Z',
          },
        ],
        count: 1,
      });

    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/pipelines/42/runs/1002' &&
          req.params.get('api-version') === '7.1'
      )
      .flush({ message: 'Server Error' }, { status: 500, statusText: 'Server Error' });

    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/build/builds/1002/timeline' &&
          req.params.get('api-version') === '7.1'
      )
      .flush({
        records: [
          {
            id: 's2',
            parentId: null,
            type: 'Stage',
            name: 'Staging',
            identifier: 'staging',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-02T00:01:00Z',
            finishTime: '2026-07-02T00:08:00Z',
            order: 1,
          },
        ],
      });

    try {
      const result = await resultPromise;
      expect(result.length).toBe(1);
      expect(result[0].runId).toBe(1002);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
