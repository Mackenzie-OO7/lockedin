import { useState } from 'react';
import { useWallet } from '../hooks/useWallet';

interface SpendingData {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

export default function Analytics() {
  const { address } = useWallet();

  // Mock data - will be replaced with real data from contract
  const [spendingByCategory] = useState<SpendingData[]>([
    { category: 'Housing', amount: 1500, percentage: 40, color: '#00d9b3' },
    { category: 'Utilities', amount: 300, percentage: 8, color: '#00a88a' },
    { category: 'Transportation', amount: 450, percentage: 12, color: '#00ffcc' },
    { category: 'Food', amount: 600, percentage: 16, color: '#4ade80' },
    { category: 'Healthcare', amount: 200, percentage: 5, color: '#60a5fa' },
    { category: 'Entertainment', amount: 350, percentage: 9, color: '#a78bfa' },
    { category: 'Other', amount: 350, percentage: 10, color: '#f472b6' },
  ]);

  const totalSpent = spendingByCategory.reduce((sum, item) => sum + item.amount, 0);

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
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Analytics</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>
          View your payment history and spending insights.
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
            Connect your wallet to view analytics
          </p>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px'
            }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
                Total Spent This Month
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                ${(totalSpent / 1_000_000).toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-success)' }}>
                ↓ 12% from last month
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px'
            }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
                Bills Paid
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                8/12
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                4 bills remaining
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px'
            }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
                Average Bill Amount
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                ${(totalSpent / spendingByCategory.length / 1_000_000).toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                Per category
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px'
            }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
                On-Time Payment Rate
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                96%
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-success)' }}>
                Excellent record
              </div>
            </div>
          </div>

          {/* Spending by Category */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', color: 'var(--color-text-primary)' }}>
              Spending by Category
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {spendingByCategory.map((item) => (
                <div key={item.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>{getCategoryEmoji(item.category)}</span>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {item.category}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        ${(item.amount / 1_000_000).toFixed(2)}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', minWidth: '40px', textAlign: 'right' }}>
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-full)',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${item.percentage}%`,
                      height: '100%',
                      backgroundColor: item.color,
                      borderRadius: 'var(--radius-full)',
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', color: 'var(--color-text-primary)' }}>
              Recent Activity
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { action: 'Paid', name: 'Rent', amount: 1500, date: '2 days ago', category: 'Housing' },
                { action: 'Paid', name: 'Electric Bill', amount: 120, date: '5 days ago', category: 'Utilities' },
                { action: 'Paid', name: 'Netflix', amount: 15, date: '1 week ago', category: 'Entertainment' },
                { action: 'Skipped', name: 'Gym Membership', amount: 50, date: '1 week ago', category: 'Other' },
                { action: 'Paid', name: 'Car Insurance', amount: 200, date: '2 weeks ago', category: 'Insurance' },
              ].map((activity, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '16px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>{getCategoryEmoji(activity.category)}</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                        {activity.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                        {activity.date}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: activity.action === 'Paid' ? 'var(--color-primary)' : 'var(--color-warning)',
                      marginBottom: '2px'
                    }}>
                      ${(activity.amount / 1_000_000).toFixed(2)}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: activity.action === 'Paid' ? 'var(--color-success)' : 'var(--color-warning)',
                      fontWeight: 500
                    }}>
                      {activity.action}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info Notice */}
          <div style={{
            backgroundColor: 'rgba(0, 217, 179, 0.05)',
            border: '1px solid rgba(0, 217, 179, 0.2)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px'
          }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ fontSize: '20px' }}>📊</div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                  Analytics Preview
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                  This page shows sample analytics data. Once you create cycles and pay bills, you'll see your actual spending patterns, payment history, and insights based on your real transaction data.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
