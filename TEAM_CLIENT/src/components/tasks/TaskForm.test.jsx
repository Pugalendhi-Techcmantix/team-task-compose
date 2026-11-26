import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskForm from './TaskForm'
import { usersApi } from '../../api/access'

vi.mock('../../api/access', () => ({ usersApi: { list: vi.fn() } }))

const USERS = [
  { id: 9, name: 'Mathan' },
  { id: 2, name: 'Priya Raman' },
]

describe('TaskForm', () => {
  beforeEach(() => {
    usersApi.list.mockReset().mockResolvedValue({ items: USERS, meta: null })
  })

  it('assigns the task to the chosen user', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    render(<TaskForm onSubmit={onSubmit} onCancel={() => {}} />)

    await userEvent.type(screen.getByLabelText('Title'), 'Review PR')
    await userEvent.selectOptions(await screen.findByLabelText(/Assignee/), 'Mathan')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review PR', assigned_to: '9' }))
  })

  it('pre-selects the current assignee and hides the field when users cannot be loaded', async () => {
    const task = { id: 1, title: 'Old', status: 'todo', priority: 'low', assigned_to: 2, assignee: { id: 2, name: 'Priya Raman' } }
    const { unmount } = render(<TaskForm task={task} onSubmit={vi.fn()} onCancel={() => {}} />)
    expect(await screen.findByLabelText(/Assignee/)).toHaveValue('2')
    unmount()

    usersApi.list.mockRejectedValue({ response: { status: 403 } })
    const onSubmit = vi.fn().mockResolvedValue()
    render(<TaskForm task={task} onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.queryByLabelText(/Assignee/)).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ assigned_to: '2' })) // unchanged, not cleared
  })

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
