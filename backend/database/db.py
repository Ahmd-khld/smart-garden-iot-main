# Mock database module to satisfy Python imports
import contextlib

class MockConnection:
    def __init__(self):
        self.row_factory = None
    
    def execute(self, sql, params=None):
        return self
        
    def fetchone(self):
        return None
        
    def fetchall(self):
        return []
        
    def __enter__(self):
        return self
        
    def __exit__(self, *args):
        pass

@contextlib.contextmanager
def connection():
    yield MockConnection()

def init_db():
    pass
