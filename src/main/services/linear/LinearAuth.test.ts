import { describe, expect, test, vi } from 'vitest'
import { LinearAuth, LINEAR_NOT_CONNECTED } from './LinearAuth'
import type { StoredLinearKey } from './LinearKeyStore'

const ACCOUNT = { name: 'Ada', organization: 'Acme' }

function setup(initial: StoredLinearKey | null = null) {
  let saved = initial
  const store = {
    load: vi.fn(async () => saved),
    save: vi.fn(async (stored: StoredLinearKey) => {
      saved = stored
    }),
    clear: vi.fn(async () => {
      saved = null
    }),
  }
  const viewer = vi.fn(async (apiKey: string) => {
    if (apiKey !== 'lin_api_good') throw new Error('Linear did not accept the API key.')
    return ACCOUNT
  })
  return { auth: new LinearAuth({ store, viewer }), store }
}

describe('LinearAuth', () => {
  test('starts disconnected, and connects with a key Linear accepts', async () => {
    const { auth, store } = setup()
    expect(await auth.state()).toEqual({ status: 'disconnected' })

    const state = await auth.connect('lin_api_good')

    expect(state).toEqual({ status: 'connected', account: ACCOUNT })
    expect(store.save).toHaveBeenCalledWith({ apiKey: 'lin_api_good', account: ACCOUNT })
    await expect(auth.withKey(async (key) => key)).resolves.toBe('lin_api_good')
  })

  test('a key Linear rejects is never saved', async () => {
    const { auth, store } = setup({ apiKey: 'lin_api_good', account: ACCOUNT })

    await expect(auth.connect('lin_api_typo')).rejects.toThrow('did not accept')

    expect(store.save).not.toHaveBeenCalled()
    await expect(auth.withKey(async (key) => key)).resolves.toBe('lin_api_good')
  })

  test('the state never carries the key', async () => {
    const { auth } = setup({ apiKey: 'lin_api_good', account: ACCOUNT })
    expect(JSON.stringify(await auth.state())).not.toContain('lin_api_good')
  })

  test('without a key, calls explain how to connect; disconnecting forgets the key', async () => {
    const { auth, store } = setup({ apiKey: 'lin_api_good', account: ACCOUNT })

    expect(await auth.disconnect()).toEqual({ status: 'disconnected' })

    expect(store.clear).toHaveBeenCalled()
    await expect(auth.withKey(async (key) => key)).rejects.toThrow(LINEAR_NOT_CONNECTED)
  })

  test('a failed read is tried again', async () => {
    const { auth, store } = setup()
    store.load.mockRejectedValueOnce(new Error('EACCES'))

    await expect(auth.state()).rejects.toThrow('EACCES')
    await expect(auth.state()).resolves.toEqual({ status: 'disconnected' })
  })
})
