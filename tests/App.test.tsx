import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

describe('App', () => {
  it('renders the landing page with title', () => {
    render(<App />);
    expect(screen.getByText('VideoP2P')).toBeInTheDocument();
  });

  it('shows the tagline about browser editing', () => {
    render(<App />);
    expect(screen.getByText(/100% in your browser/i)).toBeInTheDocument();
  });

  it('shows a drop zone for video files', () => {
    render(<App />);
    expect(screen.getByText(/drop.*video.*here/i)).toBeInTheDocument();
  });

  it('shows effect descriptions', () => {
    render(<App />);
    expect(screen.getByText(/20\+ Effects/i)).toBeInTheDocument();
    expect(screen.getByText(/P2P Share/i)).toBeInTheDocument();
  });
});
