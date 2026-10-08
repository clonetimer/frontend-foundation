import type { Preview } from '@storybook/react-vite';
import { FoundationThemeProvider } from '@foundation/theme';
const preview: Preview = { decorators: [(Story) => <FoundationThemeProvider defaultMode="light" defaultDensity="default"><div style={{padding:24}}><Story /></div></FoundationThemeProvider>] };
export default preview;
