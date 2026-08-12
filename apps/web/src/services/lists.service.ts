import { apiRequest } from '../lib/api';

export interface ListRecord {
  id: string;
  name: string;
  members: string[];
}

export async function listLists(): Promise<{ data: ListRecord[] }> {
  return apiRequest('/lists', { method: 'GET' });
}

export async function createListApi(name: string): Promise<{ data: ListRecord }> {
  return apiRequest('/lists', { method: 'POST', body: JSON.stringify({ name }) });
}

export async function deleteListApi(id: string): Promise<any> {
  return apiRequest(`/lists/${id}`, { method: 'DELETE' });
}

export async function addMemberApi(listId: string, member: string): Promise<{ data: ListRecord }> {
  return apiRequest(`/lists/${listId}/members`, { method: 'POST', body: JSON.stringify({ member }) });
}

export async function removeMemberApi(listId: string, memberIndex: number): Promise<{ data: ListRecord }> {
  return apiRequest(`/lists/${listId}/members/${memberIndex}`, { method: 'DELETE' });
}
