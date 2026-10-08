import { App, ConfigProvider } from 'antd';
import { createRoot } from 'react-dom/client';
import { DesignerApp } from './designer-app';

const root = document.getElementById('root');
if (!root) throw new Error('Designer root not found');

createRoot(root).render(
  <ConfigProvider theme={{ token: { borderRadius: 6 } }}>
    <App>
      <DesignerApp />
    </App>
  </ConfigProvider>
);
