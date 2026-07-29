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
          {
            id: 'p1',
            parentId: 's1',
            type: 'Phase',
            name: 'deployProd',
            identifier: 'deployProd',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-01T00:01:30Z',
            finishTime: '2026-07-01T00:07:30Z',
            order: 1,
          },
          {
            id: 'j1',
            parentId: 'p1',
            type: 'Deployment',
            name: 'Deploy to Production',
            identifier: 'deploy_production',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-01T00:02:00Z',
            finishTime: '2026-07-01T00:07:00Z',
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
          {
            id: 'p2',
            parentId: 's2',
            type: 'Phase',
            name: 'deployStaging',
            identifier: 'deployStaging',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-02T00:01:30Z',
            finishTime: '2026-07-02T00:07:30Z',
            order: 1,
          },
          {
            id: 'j2',
            parentId: 'p2',
            type: 'Deployment',
            name: 'Deploy to Staging',
            identifier: 'deploy_staging',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-02T00:02:00Z',
            finishTime: '2026-07-02T00:07:00Z',
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

  it('should list pipelines for configured organization and project', async () => {
    const resultPromise = firstValueFrom(
      service.listPipelines({
        organizationUrl: config.organizationUrl,
        projectName: config.projectName,
        pat: config.pat,
      })
    );

    httpMock
      .expectOne(
        (req) =>
          req.url === 'https://dev.azure.com/myorg/MyProject/_apis/pipelines' &&
          req.params.get('api-version') === '7.1'
      )
      .flush({
        value: [
          { id: 7, name: 'Deploy API' },
          { id: 12, name: 'Deploy Web' },
        ],
        count: 2,
      });

    await expect(resultPromise).resolves.toEqual([
      { id: 7, name: 'Deploy API' },
      { id: 12, name: 'Deploy Web' },
    ]);
  });

  it('should only show stages with deployment jobs, not regular stages', async () => {
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
            id: 1003,
            name: 'Deploy-1003',
            state: 'completed',
            result: 'succeeded',
            createdDate: '2026-07-03T00:00:00Z',
            finishedDate: '2026-07-03T00:10:00Z',
          },
        ],
        count: 1,
      });

    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/pipelines/42/runs/1003' &&
          req.params.get('api-version') === '7.1'
      )
      .flush({
        id: 1003,
        name: 'Deploy-1003',
        state: 'completed',
        result: 'succeeded',
        createdDate: '2026-07-03T00:00:00Z',
        finishedDate: '2026-07-03T00:10:00Z',
        resources: {
          pipelines: {
            upstream: {
              pipeline: { id: 7, name: 'Build Pipeline' },
              run: { id: 500, name: 'Build-500' },
            },
          },
        },
      });

    // This timeline contains 3 stages with realistic Azure DevOps hierarchy:
    // Stage → Phase → Job/Deployment
    // - Build stage with regular Job (no deployment) - should NOT be shown
    // - Deploy_Dev stage with Deployment job - SHOULD be shown
    // - Deploy_Prod stage with Deployment job - SHOULD be shown
    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/build/builds/1003/timeline' &&
          req.params.get('api-version') === '7.1'
      )
      .flush({
        records: [
          // Build stage with regular Job - should NOT be shown
          {
            id: 's_build',
            parentId: null,
            type: 'Stage',
            name: 'Build',
            identifier: 'build',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-03T00:01:00Z',
            finishTime: '2026-07-03T00:03:00Z',
            order: 1,
          },
          {
            id: 'p_build',
            parentId: 's_build',
            type: 'Phase',
            name: '__default',
            identifier: '__default',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-03T00:01:10Z',
            finishTime: '2026-07-03T00:02:50Z',
            order: 1,
          },
          {
            id: 'j_build',
            parentId: 'p_build',
            type: 'Job',
            name: 'Build Job',
            identifier: 'build_job',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-03T00:01:30Z',
            finishTime: '2026-07-03T00:02:30Z',
            order: 1,
          },
          // Deploy_Dev stage with Deployment (via Phase) - SHOULD be shown
          {
            id: 's_deploy_dev',
            parentId: null,
            type: 'Stage',
            name: 'Deploy to Dev',
            identifier: 'deploy_dev',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-03T00:03:00Z',
            finishTime: '2026-07-03T00:05:00Z',
            order: 2,
          },
          {
            id: 'p_deploy_dev',
            parentId: 's_deploy_dev',
            type: 'Phase',
            name: 'deployDev',
            identifier: 'deployDev',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-03T00:03:10Z',
            finishTime: '2026-07-03T00:04:50Z',
            order: 1,
          },
          {
            id: 'j_deploy_dev',
            parentId: 'p_deploy_dev',
            type: 'Deployment',
            name: 'Deploy Dev Job',
            identifier: 'deploy_dev_job',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-03T00:03:30Z',
            finishTime: '2026-07-03T00:04:30Z',
            order: 1,
          },
          // Deploy_Prod stage with Deployment (via Phase) - SHOULD be shown
          {
            id: 's_deploy_prod',
            parentId: null,
            type: 'Stage',
            name: 'Deploy to Prod',
            identifier: 'deploy_prod',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-03T00:05:00Z',
            finishTime: '2026-07-03T00:08:00Z',
            order: 3,
          },
          {
            id: 'p_deploy_prod',
            parentId: 's_deploy_prod',
            type: 'Phase',
            name: 'deployProd',
            identifier: 'deployProd',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-03T00:05:10Z',
            finishTime: '2026-07-03T00:07:50Z',
            order: 1,
          },
          {
            id: 'j_deploy_prod',
            parentId: 'p_deploy_prod',
            type: 'Deployment',
            name: 'Deploy Prod Job',
            identifier: 'deploy_prod_job',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-03T00:05:30Z',
            finishTime: '2026-07-03T00:07:30Z',
            order: 1,
          },
        ],
      });

    // Expect build info fetches for the pipeline resource - the service makes a request
    // for each stage that shares the same run detail (the observable caching doesn't prevent
    // multiple subscriptions from creating separate requests)
    const buildRequests = httpMock.match(
      (req) =>
        req.url ===
          'https://dev.azure.com/myorg/MyProject/_apis/build/builds/500' &&
        req.params.get('api-version') === '7.1'
    );
    expect(buildRequests.length).toBeGreaterThanOrEqual(1);
    buildRequests.forEach((req) =>
      req.flush({
        id: 500,
        buildNumber: 'Build-500',
        status: 'completed',
        result: 'succeeded',
        startTime: '2026-07-03T00:00:00Z',
        finishTime: '2026-07-03T00:00:30Z',
        sourceVersion: 'abc123def456',
        sourceBranch: 'refs/heads/main',
        definition: { id: 7, name: 'Build Pipeline' },
        repository: { id: 'repo1', name: 'my-repo', type: 'git' },
        requestedFor: { displayName: 'Test User', uniqueName: 'testuser@example.com' },
      })
    );

    const result = await resultPromise;
    
    // Should only include the 2 deployment stages, not the build stage
    expect(result.length).toBe(2);
    
    // Verify only deployment stages are returned
    const stageNames = result.map(r => r.stageName).sort();
    expect(stageNames).toEqual(['Deploy to Dev', 'Deploy to Prod']);
    
    // Verify Build stage is NOT in the results
    expect(result.find(r => r.stageName === 'Build')).toBeUndefined();
  });

  it('should detect YAML deployment jobs with environmentId (not type Deployment)', async () => {
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
            id: 1004,
            name: 'Deploy-1004',
            state: 'completed',
            result: 'succeeded',
            createdDate: '2026-07-04T00:00:00Z',
            finishedDate: '2026-07-04T00:10:00Z',
          },
        ],
        count: 1,
      });

    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/pipelines/42/runs/1004' &&
          req.params.get('api-version') === '7.1'
      )
      .flush({
        id: 1004,
        name: 'Deploy-1004',
        state: 'completed',
        result: 'succeeded',
        createdDate: '2026-07-04T00:00:00Z',
        finishedDate: '2026-07-04T00:10:00Z',
        resources: {
          pipelines: {
            upstream: {
              pipeline: { id: 7, name: 'Build Pipeline' },
              run: { id: 600, name: 'Build-600' },
            },
          },
        },
      });

    // This timeline contains YAML-style deployment jobs that use environments.
    // These have type 'Job' with environmentId, NOT type 'Deployment'.
    // - Build stage with regular Job (no environmentId) - should NOT be shown
    // - Deploy_QA stage with Job that has environmentId - SHOULD be shown
    // - Deploy_Prod stage with Job that has environmentId - SHOULD be shown
    httpMock
      .expectOne(
        (req) =>
          req.url ===
            'https://dev.azure.com/myorg/MyProject/_apis/build/builds/1004/timeline' &&
          req.params.get('api-version') === '7.1'
      )
      .flush({
        records: [
          // Build stage with regular Job - should NOT be shown
          {
            id: 's_build',
            parentId: null,
            type: 'Stage',
            name: 'Build',
            identifier: 'build',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-04T00:01:00Z',
            finishTime: '2026-07-04T00:03:00Z',
            order: 1,
          },
          {
            id: 'p_build',
            parentId: 's_build',
            type: 'Phase',
            name: '__default',
            identifier: '__default',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-04T00:01:10Z',
            finishTime: '2026-07-04T00:02:50Z',
            order: 1,
          },
          {
            id: 'j_build',
            parentId: 'p_build',
            type: 'Job',
            name: 'Build Job',
            identifier: 'build_job',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-04T00:01:30Z',
            finishTime: '2026-07-04T00:02:30Z',
            order: 1,
            // No environmentId - regular job
          },
          // Deploy_QA stage with YAML deployment job (type: Job + environmentId) - SHOULD be shown
          {
            id: 's_deploy_qa',
            parentId: null,
            type: 'Stage',
            name: 'Deploy to QA',
            identifier: 'deploy_qa',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-04T00:03:00Z',
            finishTime: '2026-07-04T00:05:00Z',
            order: 2,
          },
          {
            id: 'p_deploy_qa',
            parentId: 's_deploy_qa',
            type: 'Phase',
            name: 'deployQA',
            identifier: 'deployQA',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-04T00:03:10Z',
            finishTime: '2026-07-04T00:04:50Z',
            order: 1,
          },
          {
            id: 'j_deploy_qa',
            parentId: 'p_deploy_qa',
            type: 'Job', // Note: type is 'Job', not 'Deployment'
            name: 'Deploy QA Job',
            identifier: 'deploy_qa_job',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-04T00:03:30Z',
            finishTime: '2026-07-04T00:04:30Z',
            order: 1,
            environmentId: 5, // Indicates this is a deployment job targeting an environment
          },
          // Deploy_Prod stage with YAML deployment job (type: Job + environmentId) - SHOULD be shown
          {
            id: 's_deploy_prod',
            parentId: null,
            type: 'Stage',
            name: 'Deploy to Production',
            identifier: 'deploy_prod',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-04T00:05:00Z',
            finishTime: '2026-07-04T00:08:00Z',
            order: 3,
          },
          {
            id: 'p_deploy_prod',
            parentId: 's_deploy_prod',
            type: 'Phase',
            name: 'deployProd',
            identifier: 'deployProd',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-04T00:05:10Z',
            finishTime: '2026-07-04T00:07:50Z',
            order: 1,
          },
          {
            id: 'j_deploy_prod',
            parentId: 'p_deploy_prod',
            type: 'Job', // Note: type is 'Job', not 'Deployment'
            name: 'Deploy Prod Job',
            identifier: 'deploy_prod_job',
            state: 'completed',
            result: 'succeeded',
            startTime: '2026-07-04T00:05:30Z',
            finishTime: '2026-07-04T00:07:30Z',
            order: 1,
            environmentId: 10, // Indicates this is a deployment job targeting an environment
          },
        ],
      });

    // Expect build info fetches
    const buildRequests = httpMock.match(
      (req) =>
        req.url ===
          'https://dev.azure.com/myorg/MyProject/_apis/build/builds/600' &&
        req.params.get('api-version') === '7.1'
    );
    expect(buildRequests.length).toBeGreaterThanOrEqual(1);
    buildRequests.forEach((req) =>
      req.flush({
        id: 600,
        buildNumber: 'Build-600',
        status: 'completed',
        result: 'succeeded',
        startTime: '2026-07-04T00:00:00Z',
        finishTime: '2026-07-04T00:00:30Z',
        sourceVersion: 'def456abc789',
        sourceBranch: 'refs/heads/main',
        definition: { id: 7, name: 'Build Pipeline' },
        repository: { id: 'repo1', name: 'my-repo', type: 'git' },
        requestedFor: { displayName: 'Test User', uniqueName: 'testuser@example.com' },
      })
    );

    const result = await resultPromise;
    
    // Should only include the 2 deployment stages (detected via environmentId), not the build stage
    expect(result.length).toBe(2);
    
    // Verify only deployment stages are returned
    const stageNames = result.map(r => r.stageName).sort();
    expect(stageNames).toEqual(['Deploy to Production', 'Deploy to QA']);
    
    // Verify Build stage is NOT in the results
    expect(result.find(r => r.stageName === 'Build')).toBeUndefined();
  });
});
