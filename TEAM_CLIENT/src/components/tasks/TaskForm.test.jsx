import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskForm from './TaskForm'

describe('TaskForm', () => {
  it('blocks submit on empty title and shows the error', async () => {
    const onSubmit = vi.fn()
    render(<TaskForm onSubmit={onSubmit} onCancel={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
  })

  it('submits trimmed values and keeps input when the server returns 422', async () => {
    const err = { isAxiosError: true, response: { status: 422, data: { message: 'x', errors: { title: ['Title taken.'] } } } }
    const onSubmit = vi.fn().mockRejectedValue(err)
    render(<TaskForm onSubmit={onSubmit} onCancel={() => {}} />)

    await userEvent.type(screen.getByLabelText('Title'), 'Ship it')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ship it', status: 'todo', priority: 'medium' }))
    expect(await screen.findByText('Title taken.')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Ship it')
  })

  it('pre-fills values in edit mode', () => {
    render(
      <TaskForm
        task={{ id: 1, title: 'Old', description: null, status: 'done', priority: 'high', due_date: '2026-12-01T00:00:00Z' }}
        onSubmit={vi.fn()}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByLabelText('Title')).toHaveValue('Old')
    expect(screen.getByLabelText('Status')).toHaveValue('done')
    expect(screen.getByLabelText(/Due date/)).toHaveValue('2026-12-01')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })
})
