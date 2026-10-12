import { Button, Input, Select, Space, Tag, type TableColumnsType } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useApiTransport } from '@foundation/api';
import { normalizeError } from '@foundation/core';
import { DataTable, DataToolbar } from '@foundation/data';
import { useRuntimeConfig } from '@foundation/app';
import { Page, PageContent, PageHeader } from '@foundation/ui';
import { getRecords, type RecordItem, type RecordStatus } from '../api/records-api';
import { getActivePilotRevision, disablePilot } from '../../pattern-atlas/pilot/model';
import { readRecordsPilot, saveRecordsPilot, subscribeRecordsPilot } from '../../pattern-atlas/pilot/store';
import { ScopedRecordsTheme } from '../../pattern-atlas/pilot/ScopedRecordsTheme';
import '../../pattern-atlas/pilot/styles.css';

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function Component() {
  const runtime = useRuntimeConfig();
  const pilotAllowed = runtime.features.patternAtlasPilot === true;
  const [pilot, setPilot] = useState(readRecordsPilot);
  useEffect(() => subscribeRecordsPilot(() => setPilot(readRecordsPilot())), []);
  const activePilot = pilotAllowed ? getActivePilotRevision(pilot) : null;
  const transport = useApiTransport();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = positiveInt(searchParams.get('page'), 1);
  const pageSize = positiveInt(searchParams.get('pageSize'), 10);
  const search = searchParams.get('search') ?? '';
  const status = (searchParams.get('status') || undefined) as RecordStatus | undefined;
  const [draftSearch, setDraftSearch] = useState(search);

  const query = useQuery({
    queryKey: ['records', { page, pageSize, search, status }],
    queryFn: () => getRecords(transport, { page, pageSize, ...(search ? { search } : {}), ...(status ? { status } : {}) })
  });

  const columns = useMemo<TableColumnsType<RecordItem>>(() => [
    { title: 'ID', dataIndex: 'id', width: 120 },
    { title: '标题', dataIndex: 'title' },
    {
      title: '状态', dataIndex: 'status', width: 120,
      render: (value: RecordStatus) => <Tag>{value}</Tag>
    },
    { title: '更新时间', dataIndex: 'updatedAt', width: 180 },
    {
      title: '操作', key: 'action', width: 100,
      render: (_value: unknown, item: RecordItem) => <Button type="link" onClick={() => navigate(`${item.id}/edit`)}>编辑</Button>
    }
  ], [navigate]);

  const updateParams = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    setSearchParams(next);
  };

  const recordsContent = (<>
        <DataToolbar
          primary={
            <Input.Search
              allowClear
              value={draftSearch}
              placeholder="搜索标题"
              style={{ width: 280 }}
              onChange={(event) => setDraftSearch(event.target.value)}
              onSearch={(value) => updateParams({ search: value.trim() || undefined, page: '1' })}
            />
          }
          actions={
            <Space>
              <Select
                allowClear
                placeholder="全部状态"
                style={{ width: 140 }}
                value={status}
                options={[
                  { value: 'ready', label: 'ready' },
                  { value: 'draft', label: 'draft' },
                  { value: 'archived', label: 'archived' }
                ]}
                onChange={(value: RecordStatus | undefined) => updateParams({ status: value, page: '1' })}
              />
              <Button onClick={() => void query.refetch()}>刷新</Button>
            </Space>
          }
        />

        <DataTable<RecordItem>
          rowKey="id"
          columns={columns}
          data={query.data?.items ?? []}
          loading={query.isPending}
          {...(query.isError ? { error: normalizeError(query.error), retry: () => void query.refetch() } : {})}
          pagination={{
            page: query.data?.page ?? page,
            pageSize: query.data?.pageSize ?? pageSize,
            total: query.data?.total ?? 0,
            pageSizeOptions: [5, 10, 20],
            onChange: (nextPage, nextPageSize) => updateParams({ page: String(nextPage), pageSize: String(nextPageSize) })
          }}
        />
  </>);

  return (
    <Page>
      <PageHeader title="Records" description="0.2 Data Capability：URL state + Query + ApiTransport + 受控 DataTable。"
        extra={pilotAllowed ? <Space wrap>
          {activePilot ? <Tag color="green">试点开启：{activePilot.label}</Tag> : <Tag>原版模式</Tag>}
          <Link to="/records/pilot"><Button>试点对照与版本管理</Button></Link>
          {activePilot ? <Button onClick={() => saveRecordsPilot(disablePilot(pilot))}>恢复原版</Button> : null}
        </Space> : null}
      />
      <PageContent>
        {activePilot ? <ScopedRecordsTheme design={activePilot.design}>
          <div className="pa-pilot-live-marker"><b>试点版本：{activePilot.label}</b><small>局部主题仅作用于 Records 列表；查询和编辑逻辑没有变化</small></div>
          {recordsContent}
        </ScopedRecordsTheme> : recordsContent}
      </PageContent>
    </Page>
  );
}
