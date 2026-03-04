import React from 'react';

interface PostcardPreviewProps {
  message: string;
  greeting: string;
  recipientName: string;
}

export default function PostcardPreview({
  message,
  greeting,
  recipientName,
}: PostcardPreviewProps): React.ReactElement {
  return (
    <div
      className="rounded-lg overflow-hidden text-xs"
      style={{
        background: 'white',
        color: '#222',
        aspectRatio: '4/3',
        display: 'flex',
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      {/* Message side */}
      <div
        className="flex-1 flex flex-col justify-center p-3"
        style={{ borderRight: '1px solid #d1d5db' }}
      >
        <p
          className="leading-relaxed mb-2"
          style={{
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            fontSize: '8px',
            lineHeight: 1.6,
            color: '#222',
          }}
        >
          {message || '(No message selected)'}
        </p>
        <p style={{ fontStyle: 'italic', color: '#666', fontSize: '8px' }}>
          {greeting || '(No greeting)'}
        </p>
      </div>

      {/* Address side */}
      <div className="flex flex-col justify-center items-center" style={{ width: '38%' }}>
        <div className="text-center" style={{ fontSize: '7px', color: '#555', lineHeight: 1.5 }}>
          <p className="font-medium" style={{ color: '#222' }}>
            {recipientName}
          </p>
          <p>123 Main St</p>
          <p>City, ST 00000</p>
        </div>
      </div>
    </div>
  );
}
