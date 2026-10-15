"""Export TypeScript response contracts from the running FastAPI OpenAPI document."""
import argparse
import json
import urllib.request
from pathlib import Path


def type_of(schema):
    if '$ref' in schema:return schema['$ref'].split('/')[-1]
    if 'anyOf' in schema:return ' | '.join(type_of(item) for item in schema['anyOf'])
    if 'enum' in schema:return ' | '.join(json.dumps(value) for value in schema['enum'])
    kind=schema.get('type')
    if kind=='null':return 'null'
    if kind=='string':return 'string'
    if kind in ('number','integer'):return 'number'
    if kind=='boolean':return 'boolean'
    if kind=='array':return f"Array<{type_of(schema.get('items',{}))}>"
    if kind=='object':
        if 'properties' in schema:
            required=schema.get('required',[])
            return '{'+'; '.join(f"{json.dumps(key)}{'' if key in required else '?'}: {type_of(value)}" for key,value in schema['properties'].items())+'}'
        additional=schema.get('additionalProperties',{})
        return f"Record<string, {type_of(additional) if isinstance(additional,dict) else 'unknown'}>"
    return 'unknown'


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--api',default='http://backend:8000');parser.add_argument('--output',default=str(Path(__file__).resolve().parents[1]/'apps/web/src/lib/generated-api.ts'));args=parser.parse_args()
    with urllib.request.urlopen(args.api+'/openapi.json') as response:document=json.load(response)
    lines=['// Generated from FastAPI OpenAPI. Run scripts/export_api_types.py to refresh.']
    for name,schema in document['components']['schemas'].items():lines.append(f'export type {name} = {type_of(schema)};')
    Path(args.output).write_text('\n'.join(lines)+'\n',encoding='utf8')
    print(f'Exported {len(lines)-1} OpenAPI schemas.')
