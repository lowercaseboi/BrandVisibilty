"""Campaign Studio (PRD §11.5, AC-10): recommendation → campaign → approve → publish.

Submodules are imported explicitly (`from app.distribution import service`); this package does
not import them eagerly, so importing one piece never pulls in image providers or HTTP clients.
"""
