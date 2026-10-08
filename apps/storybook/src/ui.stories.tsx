import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppError } from '@foundation/core';
import { ErrorState, LoadingState, Page, PageContent, PageHeader } from '@foundation/ui';
const meta = { title: 'Kernel/UI states', component: Page } satisfies Meta<typeof Page>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PageState: Story = { render: () => <Page><PageHeader title="页面标题" description="Foundation Kernel UI"/><PageContent>内容区域</PageContent></Page> };
export const Loading: Story = { render: () => <LoadingState /> };
export const Error: Story = { render: () => <ErrorState error={new AppError({kind:'network',message:'offline',retryable:true})} retry={() => undefined} /> };
