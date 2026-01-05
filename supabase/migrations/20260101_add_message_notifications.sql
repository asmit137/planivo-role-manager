-- Function to notify participants when a new message arrives
CREATE OR REPLACE FUNCTION notify_message_participants()
RETURNS TRIGGER AS $$
DECLARE
  participant_record RECORD;
  conversation_title TEXT;
  sender_name TEXT;
BEGIN
  -- Get conversation title
  SELECT title INTO conversation_title
  FROM conversations
  WHERE id = NEW.conversation_id;

  -- Get sender's name
  SELECT full_name INTO sender_name
  FROM profiles
  WHERE id = NEW.sender_id;

  -- If no name found, use email or fallback
  IF sender_name IS NULL THEN
    SELECT email INTO sender_name
    FROM profiles
    WHERE id = NEW.sender_id;
  END IF;

  IF sender_name IS NULL THEN
    sender_name := 'Someone';
  END IF;

  -- Notify all participants except the sender
  FOR participant_record IN
    SELECT user_id
    FROM conversation_participants
    WHERE conversation_id = NEW.conversation_id
    AND user_id != NEW.sender_id
  LOOP
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      related_id,
      is_read
    ) VALUES (
      participant_record.user_id,
      'New Message',
      CASE 
        WHEN conversation_title IS NOT NULL THEN 
          sender_name || ' sent a message in ' || conversation_title
        ELSE 
          sender_name || ' sent you a message'
      END,
      'message',
      NEW.conversation_id,
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_message_created ON messages;
CREATE TRIGGER on_message_created
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_message_participants();

-- Add comment
COMMENT ON FUNCTION notify_message_participants() IS 'Automatically creates notifications for conversation participants when a new message is sent';
