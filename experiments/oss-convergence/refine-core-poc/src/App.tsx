import {
  Refine,
  useCan,
  useGetIdentity,
  useList,
  type AuthProvider,
  type DataProvider
} from '@refinedev/core';

type RecordItem = { id: string; name: string; status: 'active' | 'paused' };
const records: RecordItem[] = [
  { id: 'REC-001', name: 'Alpha', status: 'active' },
  { id: 'REC-002', name: 'Beta', status: 'paused' }
];

const dataProvider: DataProvider = {
  getApiUrl: () => '/api',
  getList: async () => ({ data: records, total: records.length }),
  getOne: async ({ id }) => ({ data: records.find((item) => item.id === id) ?? records[0]! }),
  create: async ({ variables }) => ({ data: { id: 'REC-NEW', ...(variables as Omit<RecordItem, 'id'>) } }),
  update: async ({ id, variables }) => ({ data: { ...(records.find((item) => item.id === id) ?? records[0]!), ...(variables as Partial<RecordItem>) } }),
  deleteOne: async ({ id }) => ({ data: records.find((item) => item.id === id) ?? records[0]! })
};

const authProvider: AuthProvider = {
  login: async () => ({ success: true }),
  logout: async () => ({ success: true }),
  check: async () => ({ authenticated: true }),
  onError: async () => ({ error: undefined }),
  getIdentity: async () => ({ id: 'local', name: 'Local User' }),
  getPermissions: async () => ['records.list', 'records.edit']
};

const accessControlProvider = {
  can: async ({ action }: { resource?: string; action: string }) => ({ can: action !== 'delete' })
};

function Workbench() {
  const { result, query } = useList<RecordItem>({ resource: 'records' });
  const identity = useGetIdentity<{ id: string; name: string }>();
  const edit = useCan({ resource: 'records', action: 'edit' });

  if (query.isLoading) return <p>Loading...</p>;
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Refine Core headless PoC</h1>
      <p>User: {identity.data?.name ?? 'unknown'} · Edit: {edit.data?.can ? 'yes' : 'no'}</p>
      <ul>{result.data.map((item) => <li key={item.id}>{item.id} — {item.name} — {item.status}</li>)}</ul>
    </main>
  );
}

export function App() {
  return (
    <Refine
      dataProvider={dataProvider}
      authProvider={authProvider}
      accessControlProvider={accessControlProvider}
      resources={[{ name: 'records' }]}
    >
      <Workbench />
    </Refine>
  );
}
