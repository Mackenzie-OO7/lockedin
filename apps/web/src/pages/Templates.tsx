import { useState } from 'react';
import { useWallet } from '../hooks/useWallet';

interface BillTemplate {
  id: string;
  name: string;
  category: string;
  bills: Array<{
    name: string;
    amount: string;
    dueDay: number;
    isRecurring: boolean;
    category: string;
  }>;
  createdAt: Date;
}

export default function Templates() {
  const { address } = useWallet();
  const [templates] = useState<BillTemplate[]>([]);

  const getCategoryEmoji = (category: string) => {
    const emojiMap: Record<string, string> = {
      'Housing': '🏠',
      'Utilities': '💡',
      'Transportation': '🚗',
      'Food': '🍔',
      'Healthcare': '🏥',
      'Insurance': '🛡️',
      'Entertainment': '🎬',
      'Education': '📚',
      'Debt': '💳',
      'Other': '📦'
    };
    return emojiMap[category] || '📦';
  };

  return (
    <div className="container" style={{ padding: '24px 16px 100px 16px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Templates</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>
          Save and manage bill templates for quick cycle creation.
        </p>
      </div>

      {!address ? (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '48px 24px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔌</div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>
            Connect your wallet to manage templates
          </p>
        </div>
      ) : (
        <>
          {/* Create Template Button */}
          <button
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: 'var(--color-surface)',
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--color-text-secondary)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'var(--transition-base)',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }}
          >
            <span style={{ fontSize: '20px' }}>+</span>
            Create New Template
          </button>

          {templates.length === 0 ? (
            <div style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '48px 24px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>📋</div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                No Templates Yet
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
                Create templates to save bill configurations and reuse them when creating new cycles. This saves time when you have recurring monthly bills.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {templates.map((template) => (
                <div
                  key={template.id}
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'var(--transition-base)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '24px' }}>{getCategoryEmoji(template.category)}</span>
                      <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {template.name}
                      </h3>
                    </div>
                    <button
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-tertiary)',
                        cursor: 'pointer',
                        fontSize: '18px',
                        padding: '4px'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      ⋮
                    </button>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      {template.bills.length} bill{template.bills.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                    {template.bills.slice(0, 3).map((bill, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          backgroundColor: 'var(--color-bg-secondary)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-text-secondary)'
                        }}
                      >
                        {getCategoryEmoji(bill.category)} {bill.name}
                      </span>
                    ))}
                    {template.bills.length > 3 && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          color: 'var(--color-text-tertiary)'
                        }}
                      >
                        +{template.bills.length - 3} more
                      </span>
                    )}
                  </div>

                  <div style={{
                    paddingTop: '12px',
                    borderTop: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                      Created {new Date(template.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'rgba(0, 217, 179, 0.1)',
                        border: '1px solid var(--color-primary)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--color-primary)',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'var(--transition-base)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0, 217, 179, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0, 217, 179, 0.1)';
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      Use Template
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info Card */}
          <div style={{
            marginTop: '24px',
            backgroundColor: 'rgba(0, 217, 179, 0.05)',
            border: '1px solid rgba(0, 217, 179, 0.2)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ fontSize: '20px' }}>💡</div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                  Pro Tip: Save Time with Templates
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                  Create templates for your regular monthly bills (rent, utilities, subscriptions, etc.) and reuse them when starting a new cycle. This eliminates the need to re-enter the same bills every month.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
