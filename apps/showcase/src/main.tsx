import { application } from './app/application';

const root = document.getElementById('root');
if (!root) throw new Error('Application root not found');

try {
  await application.mount(root);
} catch {
  // Foundation has already rendered a bootstrap error state and emitted telemetry.
}
