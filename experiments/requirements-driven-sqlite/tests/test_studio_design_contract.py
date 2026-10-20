from pathlib import Path
import json, unittest
root=Path(__file__).resolve().parents[1]

class StudioCandidateStructuralTest(unittest.TestCase):
    def setUp(self):
        self.doc=json.loads((root/'atlas.studio.json').read_text(encoding='utf8'))

    def test_envelope_matches_reviewed_studio_v1_schema(self):
        d=self.doc
        self.assertEqual((d['format'],d['version']),('pattern-atlas-studio',1))
        self.assertEqual(d['blueprint']['schemaVersion'],1)
        self.assertEqual(d['blueprint']['foundation']['version'],'0.21.0')
        self.assertLess(len(json.dumps(d,ensure_ascii=False).encode('utf8')),1_000_000)

    def test_all_composition_node_ids_unique_and_decorations_have_targets(self):
        targets=set(); pages=self.doc['blueprint']['pages']
        self.assertEqual([p['id'] for p in pages],['import','datasets','records'])
        for p in pages:
            ids=set()
            def scan(node):
                self.assertNotIn(node['id'],ids); ids.add(node['id'])
                self.assertIn(node['kind'],{'layout','widget'})
                for child in node.get('children',[]):scan(child)
            scan(p['composition'])
            targets|={p['id']+':'+nid for nid in ids}
        self.assertTrue(set(self.doc['decorations']).issubset(targets))

    def test_project_sources_link_to_tables_without_mutation(self):
        sources={x['id']:x for x in self.doc['dataSources']}
        for deco in self.doc['decorations'].values():
            if deco['widgetKind']=='table':
                props=deco['widgetProps']
                source=sources[props['sourceId']]
                self.assertEqual(source['paginationMode'],'server')
                self.assertTrue(source['listUrl'].startswith('/api/ff/'))
                self.assertEqual(source['saveUrl'],'')
                self.assertEqual(source.get('deleteUrl',''),'')
                self.assertLessEqual(len(props['tableColumns'].splitlines()),8)
            if deco['widgetKind']=='file-upload':
                self.assertEqual(deco['widgetProps']['uploadUrl'],'/api/ff/upload')
        self.assertEqual(len(sources),2)

    def test_navigation_and_blueprint_in_sync(self):
        self.assertEqual(self.doc['blueprint'],json.loads((root/'foundation.project.json').read_text(encoding='utf8')))
        self.assertEqual({x['target'] for x in self.doc['blueprint']['navigation']['items']},{p['id'] for p in self.doc['blueprint']['pages']})

if __name__=='__main__':unittest.main()
