
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  ingredients: () => request('/ingredients'),
  customers: () => request('/customers'),
  saves: () => request('/saves'),
  getSave: (id) => request(`/saves/${id}`),
  createSave: (name) => request('/saves', { method: 'POST', body: { name } }),
  renameSave: (id, name) => request(`/saves/${id}`, { method: 'PATCH', body: { name } }),
  deleteSave: (id) => request(`/saves/${id}`, { method: 'DELETE' }),
  saveState: (id, state) => request(`/saves/${id}/state`, { method: 'PUT', body: state }),
  createRecipe: (id, recipe) => request(`/saves/${id}/recipes`, { method: 'POST', body: recipe }),
   updateRecipe: (saveId, recipeId, recipe) =>
    request(`/saves/${saveId}/recipes/${recipeId}`, { method: 'PUT', body: recipe }),
  deleteRecipe: (saveId, recipeId) =>
    request(`/saves/${saveId}/recipes/${recipeId}`, { method: 'DELETE' }),
};