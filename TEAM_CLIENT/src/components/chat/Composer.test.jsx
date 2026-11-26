import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Composer from './Composer'

const box = () => screen.getByRole('textbox', { name: 'Message' })

describe('Composer', () => {
  it('sends on Enter and clears the box', async () => {
    const onSend = vi.fn().mockResolvedValue({ id: 1 })
    render(<Composer onSend={onSend} />)
    fireEvent.change(box(), { target: { value: 'Hello team' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Hello team'))
    await waitFor(() => expect(box()).toHaveValue(''))
  })

  it('does not send on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)
    fireEvent.change(box(), { target: { value: 'line one' } })
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('keeps the text and shows the error when sending fails', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('Not sent, try again'))
    render(<Composer onSend={onSend} />)
    fireEvent.change(box(), { target: { value: 'Important' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not sent, try again')
    expect(box()).toHaveValue('Important')
  })

  it('blocks messages over 2000 characters and shows the count', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)
    fireEvent.change(box(), { target: { value: 'x'.repeat(2001) } })
    expect(screen.getByText('2001 / 2000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('is disabled with a reason while not connected', () => {
    render(<Composer onSend={vi.fn()} disabled disabledReason="Reconnecting…" />)
    expect(box()).toBeDisabled()
    expect(box()).toHaveAttribute('placeholder', 'Reconnecting…')
  })
})
