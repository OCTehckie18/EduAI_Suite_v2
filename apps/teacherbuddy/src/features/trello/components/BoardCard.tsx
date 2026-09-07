import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Calendar, CheckSquare, AlignLeft } from 'lucide-react';
import type { TrelloCard } from '../../../store/useTrelloStore';

interface Props {
  card: TrelloCard;
  index: number;
  onClick: () => void;
}

export const BoardCard: React.FC<Props> = ({ card, index, onClick }) => {
  const completedItems = card.checklist.filter((i) => i.completed).length;
  const totalItems = card.checklist.length;
  const allDone = totalItems > 0 && completedItems === totalItems;
  const isOverdue = card.dueDate && new Date(card.dueDate) < new Date();

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={provided.draggableProps.style}
          className={`trello-card ${snapshot.isDragging ? 'trello-card-dragging' : ''}`}
          onClick={onClick}
        >
          {/* Labels */}
          {card.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {card.labels.map((l) => (
                <span
                  key={l.id}
                  className="h-2 w-10 rounded-full inline-block"
                  style={{ background: l.color }}
                  title={l.text}
                />
              ))}
            </div>
          )}

          {/* Title */}
          <p className="text-[13px] font-medium leading-snug mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
            {card.title}
          </p>

          {/* Badges row */}
          {(card.description || card.dueDate || totalItems > 0) && (
            <div className="flex items-center gap-2.5 flex-wrap mt-1">
              {card.description && (
                <AlignLeft size={13} style={{ color: 'var(--color-text-muted)' }} aria-label="Has description" />
              )}
              {card.dueDate && (
                <span
                  className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: isOverdue ? 'rgba(220,38,38,0.12)' : 'rgba(38,71,150,0.08)',
                    color: isOverdue ? '#dc2626' : 'var(--color-text-muted)',
                  }}
                >
                  <Calendar size={10} />
                  {new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              {totalItems > 0 && (
                <span
                  className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: allDone ? 'rgba(22,163,74,0.12)' : 'rgba(38,71,150,0.08)',
                    color: allDone ? '#16a34a' : 'var(--color-text-muted)',
                  }}
                >
                  <CheckSquare size={10} />
                  {completedItems}/{totalItems}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
};
