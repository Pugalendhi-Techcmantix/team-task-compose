import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const login = vi.fn()
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login }) }))

const { default: LoginPage } = await import('./LoginPage')

const renderPage = () =>
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )

describe('LoginPage', () => {
  beforeEach(() => {
    // block body: a function returned from beforeEach is run as teardown
    login.mockReset()
  })

  it('validates empty fields without calling the API', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(login).not.toHaveBeenCalled()
    expect(screen.getByText('Enter your email.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  })

  it('shows the server field error under the email input', async () => {
    login.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'bad', errors: { email: ['These credentials do not match our records.'] } } },
    })
    renderPage()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'wrong-pass' })
    const msg = await screen.findByText('These credentials do not match our records.')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', msg.id)
  })

  it('shows a banner when the server is unreachable', async () => {
    login.mockRejectedValue({ isAxiosError: true, request: {} })
    renderPage()
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i)
  })
})
