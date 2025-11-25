import MessagingPanel from './MessagingPanel';

const MessagingHub = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Messaging</h2>
        <p className="text-muted-foreground">
          Communicate with colleagues across your workspace
        </p>
      </div>
      <MessagingPanel />
    </div>
  );
};

export default MessagingHub;
