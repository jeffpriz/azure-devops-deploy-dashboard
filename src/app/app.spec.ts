import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { App } from './app';
import { ConfigFormComponent } from './components/config-form/config-form.component';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should show the config form on initial load', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-config-form')).not.toBeNull();
    expect(compiled.querySelector('app-dashboard')).toBeNull();
  });

  it('should show the dashboard after config is submitted', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    app.onConfigSubmit({
      organizationUrl: 'https://dev.azure.com/myorg',
      projectName: 'MyProject',
      pipelineId: 1,
      pat: 'test-pat',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-dashboard')).not.toBeNull();
    expect(compiled.querySelector('app-config-form')).toBeNull();
  });

  it('should return to config form after reconfigure', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    app.onConfigSubmit({
      organizationUrl: 'https://dev.azure.com/myorg',
      projectName: 'MyProject',
      pipelineId: 1,
      pat: 'test-pat',
    });
    fixture.detectChanges();

    app.onReconfigure();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-config-form')).not.toBeNull();
    expect(compiled.querySelector('app-dashboard')).toBeNull();

    const configForm = fixture.debugElement.query(By.directive(ConfigFormComponent))
      .componentInstance as ConfigFormComponent;
    expect(configForm.initialConfig()).toEqual({
      organizationUrl: 'https://dev.azure.com/myorg',
      projectName: 'MyProject',
      pipelineId: 1,
      pat: 'test-pat',
    });
  });

  it('should update the active pipeline when selected from dashboard', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();

    app.onConfigSubmit({
      organizationUrl: 'https://dev.azure.com/myorg',
      projectName: 'MyProject',
      pipelineId: 1,
      pat: 'test-pat',
    });

    app.onPipelineChange(42);
    fixture.detectChanges();

    expect(app.config()?.pipelineId).toBe(42);
    expect(app.showingConfig()).toBe(false);
  });
});
