import { Button, Card, Tag, Typography } from 'antd';
import { Link } from 'react-router';
import { Page, PageContent, PageHeader } from '@foundation/ui';

const choices = [
  { title: '创建页面', label: '开始一个项目', desc: '填写项目名称，挑选初始布局，直接进入画布。', link: '/create', action: '创建页面 →' },
  { title: '拖拽设计', label: '设计与编辑', desc: '添加组件，在同一画布中调整内容、布局、交互与特效。', link: '/studio', action: '进入设计器 →' },
  { title: '布局图鉴', label: '探索不同展示形式', desc: '浏览不同的信息组织方式，找到适合你项目的布局。', link: '/patterns', action: '浏览布局 →' },
  { title: '风格与特效', label: '视觉体验', desc: '试验效果与整体风格，选好后回到设计器配置。', link: '/patterns/effects', action: '查看特效 →' }
];

export function Component() {
  return <Page><PageHeader title="基础" description="创建页面、选择形式、拖拽编辑。"/><PageContent>
    <div style={{ padding: '29px 32px', background: 'linear-gradient(115deg,#e8f3ec,#f8faf8 72%)', border: '1px solid #dfece3', borderRadius: 18, marginBottom: 18 }}>
      <Tag color="green">开始设计</Tag>
      <Typography.Title level={2} style={{ margin: '10px 0' }}>从页面想法，到可编辑的前端</Typography.Title>
      <Typography.Paragraph style={{ maxWidth: 690, lineHeight: 1.75 }}>选一个起始布局，在画布里添加组件，直接设置交互形式与视觉特效，再导出项目源码。</Typography.Paragraph>
      <Link to="/create"><Button size="large" type="primary">创建我的页面 →</Button></Link>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(235px,1fr))', gap: 16 }}>
      {choices.map((choice) => <Card key={choice.title} title={choice.title} style={{ borderRadius: 14 }}><Tag>{choice.label}</Tag><Typography.Paragraph style={{ minHeight: 66, marginTop: 13, lineHeight: 1.75 }}>{choice.desc}</Typography.Paragraph><Link to={choice.link}><Button block>{choice.action}</Button></Link></Card>)}
    </div>
  </PageContent></Page>;
}
