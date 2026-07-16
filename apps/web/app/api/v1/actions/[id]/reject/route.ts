import { decideAction } from '@/lib/decide-action';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return decideAction(request, id, 'rejected');
}
